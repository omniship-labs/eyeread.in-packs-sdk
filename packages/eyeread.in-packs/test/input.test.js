// Input (keyboard and mouse) on `prompter:control`: where it may go, what it
// must name when the pack also reaches the internet, and `key` settings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseManifest } from '../src/manifest.js';
import { validateEntries } from '../src/validate.js';

const app = '1.0.0';
const NET = { network: ['https://api.example.com'] };
const manifest = (extra) =>
  Buffer.from(
    JSON.stringify({
      apiVersion: 1,
      id: 'com.example.t',
      name: 'T',
      version: '1.0.0',
      author: { name: 'A' },
      license: 'AGPL-3.0-only',
      main: 'main.js',
      ...extra,
    })
  );
const perms = (permissions) => manifest({ permissions });
const control = (input, extra = {}) => ({ 'prompter:control': { input, ...extra } });
const parse = (bytes) => {
  try {
    parseManifest(bytes, app);
  } catch (e) {
    return [e.code, e.message];
  }
  return [null, ''];
};
const code = (bytes) => parse(bytes)[0];
const keys = (n) => Array.from({ length: n }, (_, i) => `F${i + 1}`);

test('input parses on prompter:control', () => {
  const m = parseManifest(
    perms(
      control({
        keyboard: { keys: ['ArrowRight', 'Space'] },
        mouse: { buttons: [3, 4], wheel: true, position: true },
        scope: 'global',
      })
    ),
    app
  );
  const input = m.permissions['prompter:control'].input;
  assert.deepEqual(input.keyboard.keys, ['ArrowRight', 'Space']);
  assert.equal(input.mouse.position, true);
});

test('input belongs to prompter:control only', () => {
  for (const p of ['scripts:write', 'prompter:load', 'prompter:events', 'files:import']) {
    assert.equal(
      code(perms({ [p]: { input: { keyboard: {} } } })),
      'PACK_PERMISSION_OPTION',
      p
    );
  }
});

test('input needs keyboard or mouse, and valid options', () => {
  for (const input of [
    {},
    { scope: 'global' },
    { keyboard: { keys: ['Not A Key'] } },
    { keyboard: { keys: ['KeyA', 'KeyA'] } },
    { keyboard: {}, scope: 'everywhere' },
    { mouse: { buttons: [5] } },
    { keyboard: {}, midi: {} },
  ]) {
    assert.equal(code(perms(control(input))), 'PACK_MANIFEST_SCHEMA', JSON.stringify(input));
  }
});

test('narrow input can share a pack with network, even one permission', () => {
  const narrow = [
    { keyboard: { keys: keys(1) } },
    { keyboard: { keys: keys(8) } },
    { mouse: { buttons: [0, 3, 4] } },
    { keyboard: { keys: ['ArrowRight'] }, mouse: { buttons: [3] }, scope: 'focused' },
  ];
  for (const input of narrow) {
    assert.equal(
      code(perms({ ...control(input), 'scripts:write': NET })),
      null,
      JSON.stringify(input)
    );
    assert.equal(
      code(perms(control(input, NET))),
      null,
      `same permission ${JSON.stringify(input)}`
    );
  }
});

test('wide input can have any size when there is no network', () => {
  const wide = { keyboard: {}, mouse: { wheel: true, position: true }, scope: 'global' };
  assert.equal(code(perms(control(wide))), null);
  assert.equal(
    code(perms({ ...control({ keyboard: {} }), 'scripts:write': { network: [] } })),
    null
  );
});

test('wide input with network says which limit it broke', () => {
  const cases = [
    [{ keyboard: {} }, 'keyboard needs a keys list'],
    [{ keyboard: { keys: keys(9) } }, 'at most 8 keys'],
    [{ mouse: {} }, 'mouse needs a buttons list'],
    [{ mouse: { buttons: [0, 1, 2, 3] } }, 'at most 3 buttons'],
    [{ mouse: { buttons: [0], wheel: true } }, 'the wheel'],
    [{ mouse: { buttons: [0], position: true } }, 'pointer position'],
    [{ keyboard: { keys: ['Space'] }, scope: 'global' }, "scope can't be global"],
  ];
  for (const [input, says] of cases) {
    for (const permissions of [
      { ...control(input), 'scripts:write': NET },
      control(input, NET),
    ]) {
      const [c, message] = parse(perms(permissions));
      assert.equal(c, 'PACK_INPUT_PACK_NETWORK', JSON.stringify(input));
      assert.ok(message.includes(says), message);
    }
  }
});

test('key settings take a key code, or nothing', () => {
  const ok = manifest({
    settings: [
      { key: 'next', type: 'key', label: 'Next', default: 'ArrowRight' },
      { key: 'back', type: 'key', label: 'Back' },
    ],
  });
  assert.equal(code(ok), null);
  const bad = manifest({
    settings: [{ key: 'k', type: 'key', label: 'K', default: 'Not A Key' }],
  });
  assert.equal(code(bad), 'PACK_MANIFEST_SCHEMA');
});

// top -> a -> b, each with the given permissions.
function chain(top, a, b) {
  const pack = (id, permissions, includes = []) => [
    { path: 'LICENSE', bytes: Buffer.from('GNU AFFERO GENERAL PUBLIC LICENSE\n') },
    { path: 'main.js', bytes: Buffer.from(`// ${id}\n`) },
    {
      path: 'pack.json',
      bytes: Buffer.from(
        JSON.stringify({
          apiVersion: 1,
          id,
          name: id,
          version: '1.0.0',
          author: { name: 'T' },
          license: 'AGPL-3.0-only',
          main: 'main.js',
          permissions,
          ...(includes.length
            ? { includes: includes.map((i) => ({ id: i, version: '1.0.0' })) }
            : {}),
        })
      ),
    },
  ];
  const nested = (id, files) =>
    files.map((e) => ({ path: `packs/${id}/${e.path}`, bytes: e.bytes }));
  return [
    ...pack('com.example.top', top, ['com.example.a']),
    ...nested('com.example.a', pack('com.example.a', a, ['com.example.b'])),
    ...nested('com.example.b', pack('com.example.b', b)),
  ];
}
const bundle = (entries) => {
  try {
    validateEntries(entries, app);
  } catch (e) {
    return [e.code, e.message];
  }
  return [null, ''];
};

test('a bundle with network keeps every input narrow, at any depth and direction', () => {
  const narrow = control({ keyboard: { keys: ['ArrowRight', 'ArrowLeft'] } });
  const wide = control({ keyboard: {} });
  const net = { 'scripts:write': NET };

  // Wide input at the top, network two levels down.
  const [deep, message] = bundle(chain(wide, {}, net));
  assert.equal(deep, 'PACK_INPUT_PACK_NETWORK');
  assert.ok(message.includes('keyboard needs a keys list'), message);
  // Wide input in the middle, and the converse: network at the top, wide input included.
  assert.equal(bundle(chain({}, wide, net))[0], 'PACK_INPUT_PACK_NETWORK');
  const [converse, where] = bundle(chain(net, {}, wide));
  assert.equal(converse, 'PACK_INPUT_PACK_NETWORK');
  assert.ok(where.startsWith('packs/com.example.b/'), where);

  // Narrow input is fine next to network, in either direction.
  assert.equal(bundle(chain(narrow, {}, net))[0], null);
  assert.equal(bundle(chain(net, {}, narrow))[0], null);
  // No network anywhere: wide input is fine. No input: network is fine.
  assert.equal(bundle(chain(wide, {}, wide))[0], null);
  assert.equal(bundle(chain({}, net, net))[0], null);
});
