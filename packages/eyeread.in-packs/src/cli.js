#!/usr/bin/env node
// `npx @omniship-labs/eyeread.in-packs validate|build`. Errors and wording
// come from the shared spec (spec/errors.json), so this prints the same
// thing the app's installer would.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPack } from './build.js';
import { PackError } from './errors.js';
import { validateFolder, validateZipFile } from './validate.js';

const USAGE = `usage:
  eyeread.in-packs validate [path]   check a pack folder or .zip (default: .)
  eyeread.in-packs build [path] [-o|--out <file>]
                                     build a pack folder into a zip (default: ./<id>-<version>.zip)`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  let out;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '-o' || arg === '--out') {
      out = rest[++i];
    } else if (arg === '-h' || arg === '--help') {
      return { command: 'help' };
    } else {
      positional.push(arg);
    }
  }
  return { command, path: positional[0] ?? '.', out };
}

function printReport(label, bundle) {
  for (const pack of bundle.all()) {
    console.log(`  ${label} ${pack.manifest.id}@${pack.manifest.version}  ${pack.packHash}`);
  }
}

async function runValidate(path) {
  const target = resolve(path);
  const isZip = target.toLowerCase().endsWith('.zip');
  const bundle = isZip
    ? await validateZipFile(target, undefined)
    : await validateFolder(target, undefined);
  console.log(`✓ valid`);
  printReport(' ', bundle);
}

async function runBuild(path, out) {
  const target = resolve(path);
  const { bytes, bundle } = await buildPack(target, undefined);
  const outPath = resolve(
    out ?? `${bundle.top.manifest.id}-${bundle.top.manifest.version}.zip`
  );
  await writeFile(outPath, bytes);
  console.log(`Built ${outPath}`);
  printReport(' ', bundle);
}

async function main() {
  const { command, path, out } = parseArgs(process.argv.slice(2));
  if (command === 'help' || !command) {
    console.log(USAGE);
    process.exitCode = command ? 0 : 1;
    return;
  }
  try {
    if (command === 'validate') await runValidate(path);
    else if (command === 'build') await runBuild(path, out);
    else {
      console.error(`eyeread.in-packs: unknown command "${command}"\n\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    if (err instanceof PackError) {
      console.error(`✗ ${err}`);
    } else {
      console.error(`✗ ${err.message ?? err}`);
    }
    process.exitCode = 1;
  }
}

main();
