// Input permissions (keyboard, mouse, MIDI, gamepad): no network, options only
// where they belong, and `key` settings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseManifest } from '../src/manifest.js';

const app = '1.0.0';
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
const code = (bytes) => {
  try {
    parseManifest(bytes, app);
  } catch (e) {
    return e.code;
  }
  return null;
};

test('input permissions parse with their options', () => {
  const m = parseManifest(
    perms({
      'input:keyboard': { keys: ['ArrowRight', 'Space'], scope: 'global' },
      'input:mouse': { buttons: [3, 4], position: true },
      'input:midi': {},
      'input:gamepad': {},
    }),
    app
  );
  assert.deepEqual(m.permissions['input:keyboard'].keys, ['ArrowRight', 'Space']);
  assert.equal(m.permissions['input:mouse'].position, true);
});

test("input permissions can't declare network, even an empty list", () => {
  for (const p of ['input:keyboard', 'input:mouse', 'input:midi', 'input:gamepad']) {
    assert.equal(
      code(perms({ [p]: { network: ['https://api.example.com'] } })),
      'PACK_INPUT_NETWORK'
    );
  }
  assert.equal(code(perms({ 'input:midi': { network: [] } })), 'PACK_INPUT_NETWORK');
});

test('options belong to their permissions', () => {
  const cases = [
    ['input:midi', { keys: ['KeyA'] }],
    ['input:mouse', { keys: ['KeyA'] }],
    ['input:keyboard', { buttons: [0] }],
    ['input:keyboard', { position: true }],
    ['scripts:write', { scope: 'global' }],
  ];
  for (const [p, decl] of cases) {
    assert.equal(code(perms({ [p]: decl })), 'PACK_PERMISSION_OPTION', p);
  }
});

test('bad key codes, duplicates, scopes and buttons fail the schema', () => {
  for (const decl of [
    { keys: ['Not A Key'] },
    { keys: ['KeyA', 'KeyA'] },
    { scope: 'everywhere' },
  ]) {
    assert.equal(code(perms({ 'input:keyboard': decl })), 'PACK_MANIFEST_SCHEMA');
  }
  assert.equal(code(perms({ 'input:mouse': { buttons: [5] } })), 'PACK_MANIFEST_SCHEMA');
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
