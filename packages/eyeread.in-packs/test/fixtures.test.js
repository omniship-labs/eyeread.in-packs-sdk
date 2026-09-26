// Every pack in `spec/fixtures/` goes through the same checks the app's
// installer runs, and the result must match `fixtures/expected.json` — the
// JS mirror of the app's src-tauri/src/packs/fixture_tests.rs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readZip } from '../src/archive.js';
import { validateEntries } from '../src/validate.js';
import { zipFixture } from '../test-helpers/zipFixture.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '../../../spec/fixtures');
const expected = JSON.parse(readFileSync(join(fixturesDir, 'expected.json'), 'utf8'));
const fixtures = expected.fixtures;

const appVersion = '1.0.0';

test('every fixture installs or fails as the spec expects', async () => {
  assert.ok(Object.keys(fixtures).length >= 40, 'fixtures went missing');
  const failures = [];

  for (const [name, want] of Object.entries(fixtures)) {
    const zipBytes = await zipFixture(fixturesDir, name, want.zipExtra ?? []);
    let result;
    try {
      const entries = await readZip(zipBytes);
      result = { ok: true, bundle: validateEntries(entries, appVersion) };
    } catch (err) {
      result = { ok: false, error: err };
    }

    if (want.error === null) {
      if (!result.ok) failures.push(`${name}: expected valid, got ${result.error}`);
    } else if (result.ok) {
      failures.push(`${name}: expected ${want.error}, but it validated`);
    } else if (result.error.code !== want.error) {
      failures.push(`${name}: expected ${want.error}, got ${result.error}`);
    } else {
      // A clear error: the message is filled in, not a bare template.
      const msg = result.error.message;
      if (msg.includes('{') && !msg.includes('{}')) {
        failures.push(`${name}: unfilled message: ${msg}`);
      }
    }
  }
  assert.equal(failures.length, 0, `\n${failures.join('\n')}`);
});

test('bundle fixture includes every included pack, depth first, each once', async () => {
  const zipBytes = await zipFixture(fixturesDir, 'valid-bundle', []);
  const bundle = validateEntries(await readZip(zipBytes), appVersion);
  const ids = bundle.all().map((p) => p.manifest.id);
  assert.deepEqual(ids, ['com.example.bundle', 'com.example.a', 'com.example.b']);
});
