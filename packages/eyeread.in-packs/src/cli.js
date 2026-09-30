#!/usr/bin/env node
// `npx @omniship-labs/eyeread.in-packs validate|build|submit`. Errors and wording
// come from the shared spec (spec/errors.json), so this prints the same
// thing the app's installer would.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { addSignature } from './addSignature.js';
import { readZipFile } from './archive.js';
import { buildPack } from './build.js';
import { PackError } from './errors.js';
import { submit, SubmitError } from './submit.js';
import { validateFolder, validateZipFile } from './validate.js';

const USAGE = `usage:
  eyeread.in-packs validate [path]   check a pack folder or .zip (default: .)
  eyeread.in-packs build [path] [-o|--out <file>]
                                     build a pack folder into a zip (default: ./<id>-<version>.zip)
  eyeread.in-packs add-signature <pack.zip> <files.json.minisig> [-o|--out <file>]
                                     add a reviewed version's signature to its zip (default: replaces the zip)
  eyeread.in-packs submit [path] [--tag <tag>] [--url <zip url>] [--release] [--dry-run]
                                     open a pull request to get a released version Verified`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  let out;
  const submitOpts = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '-o' || arg === '--out') {
      out = rest[++i];
    } else if (arg === '--tag' || arg === '--url') {
      submitOpts[arg.slice(2)] = rest[++i];
    } else if (arg === '--release') {
      submitOpts.release = true;
    } else if (arg === '--dry-run') {
      submitOpts.dryRun = true;
    } else if (arg === '-h' || arg === '--help') {
      return { command: 'help' };
    } else {
      positional.push(arg);
    }
  }
  return { command, path: positional[0] ?? '.', positional, out, submitOpts };
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

async function runAddSignature(positional, out) {
  const [zip, sig] = positional;
  if (!zip || !sig) throw new Error('add-signature needs <pack.zip> <files.json.minisig>');
  const { bytes, bundle } = await addSignature(
    await readZipFile(resolve(zip)),
    await readFile(resolve(sig)),
    undefined
  );
  const outPath = resolve(out ?? zip);
  await writeFile(outPath, bytes);
  console.log(`Signed ${outPath}`);
  printReport(' ', bundle);
}

async function main() {
  const { command, path, positional, out, submitOpts } = parseArgs(process.argv.slice(2));
  if (command === 'help' || !command) {
    console.log(USAGE);
    process.exitCode = command ? 0 : 1;
    return;
  }
  try {
    if (command === 'validate') await runValidate(path);
    else if (command === 'build') await runBuild(path, out);
    else if (command === 'add-signature') await runAddSignature(positional, out);
    else if (command === 'submit') await submit(resolve(path), submitOpts);
    else {
      console.error(`eyeread.in-packs: unknown command "${command}"\n\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
  } catch (err) {
    if (err instanceof PackError) {
      console.error(`✗ ${err}`);
    } else if (err instanceof SubmitError) {
      console.error(`✗ ${err.message}`);
    } else {
      console.error(`✗ ${err.message ?? err}`);
    }
    process.exitCode = 1;
  }
}

main();
