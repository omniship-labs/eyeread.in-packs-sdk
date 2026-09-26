// End-to-end: run the actual `eyeread.in-packs` bin against fixtures.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '../src/cli.js');
const fixturesDir = join(here, '../../../spec/fixtures');

test('validate exits 0 on a valid pack folder', async () => {
  const { stdout } = await run('node', [cli, 'validate', join(fixturesDir, 'valid-minimal')]);
  assert.match(stdout, /valid/);
});

test('validate exits non-zero with the spec error code on an invalid pack', async () => {
  await assert.rejects(
    run('node', [cli, 'validate', join(fixturesDir, 'invalid-license-mit')]),
    (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /PACK_LICENSE/);
      return true;
    }
  );
});

test('build writes a zip that validate then accepts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eyeread-packs-'));
  try {
    const out = join(dir, 'out.zip');
    const { stdout: buildOut } = await run('node', [
      cli,
      'build',
      join(fixturesDir, 'valid-minimal'),
      '--out',
      out,
    ]);
    assert.match(buildOut, /Built/);
    const { stdout: validateOut } = await run('node', [cli, 'validate', out]);
    assert.match(validateOut, /valid/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
