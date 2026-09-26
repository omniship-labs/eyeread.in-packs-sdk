#!/usr/bin/env node
// `npm create @omniship-labs/eyeread.in-packs my-pack`: copies ../template
// into a new folder, filling in the id/name/author/permission a creator
// picks (or sensible defaults, non-interactively).
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = join(here, '../template');

const PERMISSIONS = [
  'scripts:write',
  'prompter:load',
  'prompter:control',
  'prompter:events',
  'files:import',
];

const TEXT_FILES = new Set(['pack.json', 'main.js', 'README.md']);

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-pack'
  );
}

function titleCase(slug) {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

async function prompt(rl, question, fallback) {
  if (!rl) return fallback;
  const answer = (await rl.question(`${question} ${fallback ? `(${fallback}) ` : ''}`)).trim();
  return answer || fallback;
}

async function copyTemplate(target, tokens) {
  await mkdir(target, { recursive: true });
  const entries = await readdir(templateDir);
  for (const name of entries) {
    const src = join(templateDir, name);
    const dest = join(target, name);
    let contents = await readFile(src);
    if (TEXT_FILES.has(name)) {
      let text = contents.toString('utf8');
      for (const [key, value] of Object.entries(tokens)) {
        text = text.replaceAll(`{{${key}}}`, value);
      }
      contents = Buffer.from(text, 'utf8');
    }
    await writeFile(dest, contents);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    console.log('usage: npm create @omniship-labs/eyeread.in-packs <folder>');
    process.exitCode = argv.length === 0 ? 1 : 0;
    return;
  }
  const targetDir = argv[0];
  const target = join(process.cwd(), targetDir);

  const existing = await stat(target).catch(() => null);
  if (existing) {
    const contents = await readdir(target);
    if (contents.length > 0) {
      console.error(`create-eyeread.in-packs: ${targetDir} already exists and isn't empty`);
      process.exitCode = 1;
      return;
    }
  }

  const slug = slugify(targetDir);
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  const rl = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  const name = await prompt(rl, 'Pack name?', titleCase(slug));
  const id = await prompt(rl, 'Pack id (reverse-DNS)?', `com.example.${slug}`);
  const author = await prompt(rl, 'Author name?', 'Your Name');
  const description = await prompt(rl, 'One-line description?', '');
  let permission = PERMISSIONS[0];
  if (rl) {
    const list = PERMISSIONS.map((p, i) => `  ${i + 1}) ${p}`).join('\n');
    const answer = await prompt(rl, `First permission?\n${list}\nChoice?`, '1');
    const index = Number.parseInt(answer, 10) - 1;
    if (Number.isInteger(index) && PERMISSIONS[index]) permission = PERMISSIONS[index];
  }
  rl?.close();

  await copyTemplate(target, {
    ID: id,
    NAME: name,
    AUTHOR: author,
    DESCRIPTION: description,
    PERMISSION: permission,
  });

  console.log(`\nCreated ${name} in ./${targetDir}`);
  console.log(`
Next steps:
  cd ${targetDir}
  npx @omniship-labs/eyeread.in-packs validate

Then load the folder from eyeread.in → Settings → Packs → Developer mode.`);
}

main();
