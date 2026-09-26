import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('repo is AGPL-3.0 licensed, matching eyeread.in', () => {
  const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/);
});

const PACKAGES = ['create-eyeread.in-packs', 'eyeread.in-packs', 'eyeread.in-packs-types'];

for (const name of PACKAGES) {
  test(`${name}: package.json declares AGPL-3.0-or-later`, () => {
    const pkg = JSON.parse(
      readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url))
    );
    assert.equal(pkg.license, 'AGPL-3.0-or-later');
  });

  test(`${name}: publishes its own LICENSE file (after \`npm run build\`)`, () => {
    const pkg = JSON.parse(
      readFileSync(new URL(`../packages/${name}/package.json`, import.meta.url))
    );
    assert.ok(pkg.files.includes('LICENSE'), '"LICENSE" is listed in package.json "files"');
    const license = readFileSync(
      new URL(`../packages/${name}/LICENSE`, import.meta.url),
      'utf8'
    );
    assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/);
  });
}
