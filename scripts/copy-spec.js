#!/usr/bin/env node
// Vendors the parts of spec/ that a published package needs into that
// package's own directory, so `npm publish` (which can't reach outside a
// package's root) ships a self-contained tarball. `spec/` stays the one
// source of truth; nothing here is hand-edited.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const spec = join(root, 'spec');

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
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

console.log('Copied spec/ into packages/eyeread.in-packs-types and packages/eyeread.in-packs.');
