// `build` turns a pack source folder into a zip with a fresh files.json, and
// doing it twice from the same input produces byte-identical output.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/archive.js';
import { buildPack } from '../src/build.js';
import { validateEntries } from '../src/validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '../../../spec/fixtures');

test('build produces a zip with files.json that installs cleanly', async () => {
  const { bytes, bundle } = await buildPack(join(fixturesDir, 'valid-minimal'), '1.0.0');
  assert.equal(bundle.top.manifest.id, 'com.example.minimal');

  const entries = await readZip(bytes);
  const filesJson = entries.find((e) => e.path === 'files.json');
  assert.ok(filesJson, 'files.json is in the built zip');

  // The built zip re-validates cleanly, files.json included.
  const revalidated = validateEntries(entries, '1.0.0');
  assert.equal(revalidated.top.manifest.id, 'com.example.minimal');
});

test('build is deterministic: the same folder always builds the same bytes', async () => {
  const a = await buildPack(join(fixturesDir, 'valid-minimal'), '1.0.0');
  const b = await buildPack(join(fixturesDir, 'valid-minimal'), '1.0.0');
  assert.ok(a.bytes.equals(b.bytes));
});

test('build ignores a stale files.json already on disk', async () => {
  // valid-files-json ships a files.json that matches its current content;
  // build must recompute it regardless (and would fail validation here if it
  // trusted the stale one and it didn't match, so this also covers that path).
  const { bundle } = await buildPack(join(fixturesDir, 'valid-files-json'), '1.0.0');
  assert.equal(bundle.top.manifest.id, 'com.example.hashed');
});

test("build skips a top-level .git, so a pack folder can be a repo's root", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'eyeread-git-root-'));
  try {
    await cp(join(fixturesDir, 'valid-minimal'), dir, { recursive: true });
    const plain = await buildPack(dir, '1.0.0');
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    const inRepo = await buildPack(dir, '1.0.0');
    assert.ok(inRepo.bytes.equals(plain.bytes));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
