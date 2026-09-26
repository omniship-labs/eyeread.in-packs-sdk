#!/usr/bin/env node
// Vendors the parts of spec/ and the root LICENSE that a published package
// needs into that package's own directory, so `npm publish` (which can't
// reach outside a package's root) ships a self-contained tarball with its own
// AGPL license text, not just a "license" field pointing at a file that isn't
// there once the package is installed on its own. spec/ and LICENSE stay the
// one source of truth; nothing under packages/*/spec or packages/*/LICENSE is
// hand-edited (both are gitignored).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const spec = join(root, 'spec');
const license = join(root, 'LICENSE');

const PACKAGES = ['create-eyeread.in-packs', 'eyeread.in-packs', 'eyeread.in-packs-types'];

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

for (const name of PACKAGES) {
  copyFile(license, join(root, 'packages', name, 'LICENSE'));
}

// packages/eyeread.in-packs-types/index.d.ts
copyFile(join(spec, 'eyeread.d.ts'), join(root, 'packages/eyeread.in-packs-types/index.d.ts'));

// packages/eyeread.in-packs/spec/{pack,files}.schema.json, errors.json
const cliSpecDir = join(root, 'packages/eyeread.in-packs/spec');
rmSync(cliSpecDir, { recursive: true, force: true });
mkdirSync(cliSpecDir, { recursive: true });
for (const name of ['pack.schema.json', 'files.schema.json', 'errors.json']) {
  copyFile(join(spec, name), join(cliSpecDir, name));
}

console.log(
  'Copied LICENSE into every package, and spec/ into eyeread.in-packs-types and eyeread.in-packs.'
);
