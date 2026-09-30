// `add-signature` puts a catalog signature into a zip without changing the
// pack hash, and refuses one that was made for something else.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { addSignature, trustedComment } from '../src/addSignature.js';
import { readZip } from '../src/archive.js';
import { buildPack } from '../src/build.js';
import { validateEntries } from '../src/validate.js';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '../src/cli.js');
const pack = join(here, '../../../spec/fixtures/valid-minimal');

/** A signature-shaped file with the given trusted comment (not a real signature). */
const fakeSig = (comment) =>
  `untrusted comment: signature from eyeread.in sign-pack\nRUSQ1+3r5d931UIs\ntrusted comment: ${comment}\nAAAA\n`;

async function built() {
  const { bytes, bundle } = await buildPack(pack, '1.0.0');
  const { id, version } = bundle.top.manifest;
  return { entries: await readZip(bytes), id, version, hash: bundle.top.packHash };
}

test('adds the signature and leaves the pack hash alone', async () => {
  const { entries, id, version, hash } = await built();
  const sig = fakeSig(trustedComment(id, version, hash));
  const { bytes } = await addSignature(entries, sig, '1.0.0');

  const after = await readZip(bytes);
  const shipped = after.find((e) => e.path === 'files.json.minisig');
  assert.equal(shipped.bytes.toString().trim(), sig.trim());
  assert.equal(validateEntries(after, '1.0.0').top.packHash, hash);
});

test('adds files.json when the zip has none', async () => {
  const { entries, id, version, hash } = await built();
  const bare = entries.filter((e) => e.path !== 'files.json');
  const { bytes } = await addSignature(
    bare,
    fakeSig(trustedComment(id, version, hash)),
    '1.0.0'
  );
  assert.ok((await readZip(bytes)).some((e) => e.path === 'files.json'));
});

test('replaces an existing signature', async () => {
  const { entries, id, version, hash } = await built();
  const sig = fakeSig(trustedComment(id, version, hash));
  const once = await readZip((await addSignature(entries, sig, '1.0.0')).bytes);
  const twice = await readZip((await addSignature(once, sig, '1.0.0')).bytes);
  assert.equal(twice.filter((e) => e.path === 'files.json.minisig').length, 1);
});

test('refuses a signature made for another version or pack', async () => {
  const { entries, id, hash } = await built();
  await assert.rejects(
    addSignature(entries, fakeSig(trustedComment(id, '9.9.9', hash)), '1.0.0'),
    /different pack or version/
  );
  await assert.rejects(
    addSignature(entries, fakeSig(trustedComment(id, '1.0.0', 'deadbeef')), '1.0.0'),
    /different pack or version/
  );
});

test("refuses a file that isn't a minisign signature", async () => {
  const { entries } = await built();
  await assert.rejects(addSignature(entries, 'hello', '1.0.0'), /isn't a minisign signature/);
});

test('CLI: add-signature writes a zip that validate accepts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eyeread-addsig-'));
  try {
    const { id, version, hash } = await built();
    const zip = join(dir, 'p.zip');
    await run('node', [cli, 'build', pack, '--out', zip]);
    const sig = join(dir, 'files.json.minisig');
    await writeFile(sig, fakeSig(trustedComment(id, version, hash)));
    const out = join(dir, 'signed.zip');
    const { stdout } = await run('node', [cli, 'add-signature', zip, sig, '-o', out]);
    assert.match(stdout, /Signed/);
    const { stdout: v } = await run('node', [cli, 'validate', out]);
    assert.match(v, /valid/);
    assert.ok((await readFile(out)).length > (await readFile(zip)).length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
