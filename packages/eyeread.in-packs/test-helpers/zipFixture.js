// Zips a `spec/fixtures/<name>` folder the way a creator would, plus its raw
// `zipExtra` entries (paths a folder on disk can't hold, like `../evil.js` or
// a symlink) — the same construction the app's Rust test suite uses
// (fixture_tests.rs), so both sides check the exact same bytes.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildRawZip, S_IFLNK } from './rawZip.js';

function listFiles(root, rel, out) {
  for (const name of readdirSync(join(root, rel)).sort()) {
    const path = rel ? `${rel}/${name}` : name;
    if (statSync(join(root, path)).isDirectory()) listFiles(root, path, out);
    else out.push(path);
  }
}

export async function zipFixture(fixturesDir, name, extra = []) {
  const root = join(fixturesDir, name);
  const paths = [];
  listFiles(root, '', paths);
  const entries = paths.map((path) => ({
    name: path,
    content: readFileSync(join(root, path)),
    mode: 0o100644,
  }));
  for (const e of extra) {
    entries.push(
      e.symlink
        ? { name: e.name, content: e.symlink, mode: S_IFLNK | 0o777 }
        : { name: e.name, content: e.content, mode: 0o100644 }
    );
  }
  return buildRawZip(entries);
}
