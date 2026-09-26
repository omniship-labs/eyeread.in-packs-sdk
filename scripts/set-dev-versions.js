#!/usr/bin/env node
// Every push to main publishes a throwaway prerelease under the npm `dev`
// dist-tag, so the SDK can be tried against an in-progress app build without
// waiting for a tagged release. Each package's own version gets a `-dev.<id>`
// suffix; nothing here is committed, it only rewrites the checkout that this
// CI run publishes from. Run with DEV_SUFFIX=<short sha or similar> set.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const suffix = process.env.DEV_SUFFIX;
if (!suffix || !/^[0-9a-z.-]+$/i.test(suffix)) {
  console.error(
    'set-dev-versions: DEV_SUFFIX must be set to an id safe for a semver build tag'
  );
  process.exit(1);
}

const packages = ['create-eyeread.in-packs', 'eyeread.in-packs', 'eyeread.in-packs-types'];
for (const name of packages) {
  const path = join(root, 'packages', name, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  const base = pkg.version.split('-')[0]; // drop any existing prerelease tag
  pkg.version = `${base}-dev.${suffix}`;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`${name}: ${pkg.version}`);
}
