#!/usr/bin/env node
// A stable release is a `vX.Y.Z` tag; every package here must already be at
// that version (bumped and committed before tagging), so the tag and the
// published packages can never drift apart. Run with TAG_VERSION=X.Y.Z set.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tagVersion = process.env.TAG_VERSION;
if (!tagVersion) {
  console.error('check-tag-version: TAG_VERSION is not set');
  process.exit(1);
}

const packages = ['create-eyeread.in-packs', 'eyeread.in-packs', 'eyeread.in-packs-types'];
const mismatched = packages.filter((name) => {
  const pkg = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'));
  return pkg.version !== tagVersion;
});

if (mismatched.length > 0) {
  console.error(
    `check-tag-version: tag is v${tagVersion}, but package.json version doesn't match it for: ${mismatched.join(', ')}\n` +
      'Bump every package to the same version and commit that before tagging.'
  );
  process.exit(1);
}
console.log(`check-tag-version: all packages are at ${tagVersion}, matching the tag.`);
