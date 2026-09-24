import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('repo is AGPL-3.0 licensed, matching eyeread.in', () => {
  const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/);
});
