// End-to-end: scaffold a pack non-interactively, then check it with the real
// eyeread.in-packs CLI — the three packages agreeing with each other.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const createCli = join(here, '../src/index.js');
const validateCli = join(here, '../../eyeread.in-packs/src/cli.js');

test('scaffolds a pack that the CLI validates', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'create-eyeread-packs-'));
  try {
    const { stdout } = await run('node', [createCli, 'my-pack'], { cwd: workDir });
    assert.match(stdout, /Created/);

    const packDir = join(workDir, 'my-pack');
    const files = await readdir(packDir);
    assert.deepEqual(files.sort(), ['LICENSE', 'README.md', 'main.js', 'pack.json'].sort());

    const manifest = JSON.parse(await readFile(join(packDir, 'pack.json'), 'utf8'));
    assert.equal(manifest.id, 'com.example.my-pack');
    assert.equal(manifest.name, 'My Pack');
    assert.ok(Object.hasOwn(manifest.permissions, 'scripts:write'));

    const { stdout: validateOut } = await run('node', [validateCli, 'validate', packDir]);
    assert.match(validateOut, /valid/);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test('refuses to scaffold into a non-empty folder', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'create-eyeread-packs-'));
  try {
    await run('node', [createCli, 'my-pack'], { cwd: workDir });
    await assert.rejects(run('node', [createCli, 'my-pack'], { cwd: workDir }), (err) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /already exists/);
      return true;
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
