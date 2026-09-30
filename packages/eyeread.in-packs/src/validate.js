// Validating a whole pack, bundles included, in the spec's check order
// (FORMAT.md, "Validation errors"). Mirrors the app's
// src-tauri/src/packs/validate.rs, so a pack that validates here installs.
import { FILES_JSON, readFolder, readZip, readZipFile, SIGNATURE_FILE } from './archive.js';
import { PackError } from './errors.js';
import { compareFilesLists, computeFilesList, packHash, parseFilesList } from './filesList.js';
import { parseManifest } from './manifest.js';

export const MAX_INCLUDED = 32;
export const MAX_DEPTH = 4;
const MAX_LINE_CHARS = 1000;
const MINIFIED_MIN_BYTES = 2048;
const MINIFIED_BYTES_PER_LINE = 200;

/**
 * Readable source rule: no line over 1000 characters, and a file of 2 KiB or
 * more must average at most 200 bytes per line.
 */
export function looksMinified(bytes) {
  const text = Buffer.from(bytes).toString('utf8');
  // Rust's `str::lines()`: split on '\n', strip a trailing '\r', and don't
  // count a final empty line produced by a trailing newline.
  let body = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines =
    body === '' ? [] : body.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  for (const line of lines) {
    if ([...line].length > MAX_LINE_CHARS) return true;
  }
  const lineCount = Math.max(lines.length, 1);
  return (
    bytes.length >= MINIFIED_MIN_BYTES && bytes.length > MINIFIED_BYTES_PER_LINE * lineCount
  );
}

function find(entries, path) {
  return entries.find((e) => e.path === path);
}

/** Steps 2-8 for one pack, over its own files. */
function validatePackEntries(entries, folder, appVersion) {
  const manifestEntry = find(entries, 'pack.json');
  if (!manifestEntry) throw new PackError('PACK_MANIFEST_MISSING', {});
  const manifest = parseManifest(manifestEntry.bytes, appVersion);

  if (manifest.main) {
    if (!find(entries, manifest.main)) {
      throw new PackError('PACK_MAIN_MISSING', { path: `${folder}${manifest.main}` });
    }
  }
  for (const e of entries) {
    const lower = e.path.toLowerCase();
    if ((lower.endsWith('.js') || lower.endsWith('.mjs')) && looksMinified(e.bytes)) {
      throw new PackError('PACK_MINIFIED', { path: `${folder}${e.path}` });
    }
  }

  const files = computeFilesList(manifest.id, manifest.version, entries);
  const shippedFilesJsonEntry = find(entries, FILES_JSON);
  if (shippedFilesJsonEntry) {
    const shipped = parseFilesList(shippedFilesJsonEntry.bytes, manifest.id, manifest.version);
    compareFilesLists(shipped, files, folder);
  }
  const signature = find(entries, SIGNATURE_FILE)?.bytes ?? null;
  return {
    manifest,
    entries,
    files,
    packHash: packHash(files),
    shippedFilesJson: shippedFilesJsonEntry?.bytes ?? null,
    signature,
  };
}

/** What the bundle walk needs from an included pack's pack.json, read leniently. */
function readNode(entries, folder) {
  const e = find(entries, 'pack.json');
  if (!e) throw new PackError('PACK_MANIFEST_MISSING', {}).inFolder(folder);
  let value;
  try {
    value = JSON.parse(Buffer.from(e.bytes).toString('utf8'));
  } catch (err) {
    throw new PackError('PACK_MANIFEST_INVALID_JSON', { detail: err.message }).inFolder(folder);
  }
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    version: typeof value.version === 'string' ? value.version : undefined,
    includes: Array.isArray(value.includes)
      ? value.includes
          .filter((inc) => typeof inc?.id === 'string' && typeof inc?.version === 'string')
          .map((inc) => [inc.id, inc.version])
      : [],
  };
}

class Walk {
  constructor(groups) {
    this.groups = groups;
    this.nodes = new Map();
    /** Included pack ids, in `includes` order, depth first. */
    this.order = [];
  }

  visit(includes, stack) {
    const seen = new Set();
    for (const [id] of includes) {
      if (seen.has(id)) throw new PackError('PACK_INCLUDE_DUPLICATE', { id });
      seen.add(id);
    }
    for (const [id, version] of includes) {
      if (stack.includes(id)) {
        const cycle = [...stack, id].join(' → ');
        throw new PackError('PACK_INCLUDE_CYCLE', { cycle });
      }
      const missing = () => new PackError('PACK_INCLUDE_MISSING', { id, version });
      const entries = this.groups.get(id);
      if (!entries) throw missing();
      if (!this.nodes.has(id)) {
        this.nodes.set(id, readNode(entries, `packs/${id}/`));
      }
      const node = this.nodes.get(id);
      if (node.id !== id) throw missing();
      if (node.version !== version) {
        throw new PackError('PACK_INCLUDE_VERSION', {
          id,
          version,
          found: node.version ?? 'none',
        });
      }
      if (this.order.includes(id)) continue; // shared by two packs; walked already
      this.order.push(id);
      if (this.order.length > MAX_INCLUDED || stack.length > MAX_DEPTH) {
        throw new PackError('PACK_INCLUDE_LIMIT', { limit: MAX_INCLUDED, depth: MAX_DEPTH });
      }
      stack.push(id);
      this.visit(node.includes, stack);
      stack.pop();
    }
  }
}

/**
 * Validate a pack from its checked entries (step 1 already done): the
 * top-level pack, then the bundle graph, then each included pack.
 */
export function validateEntries(entries, appVersion) {
  const own = [];
  const groups = new Map();
  const strays = [];
  for (const e of entries) {
    if (!e.path.startsWith('packs/')) {
      own.push(e);
      continue;
    }
    const rest = e.path.slice('packs/'.length);
    const slash = rest.indexOf('/');
    if (slash === -1) {
      strays.push(rest);
      continue;
    }
    const id = rest.slice(0, slash);
    const inner = rest.slice(slash + 1);
    if (inner.startsWith('packs/')) {
      strays.push(`${id}/packs`);
      continue;
    }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ path: inner, bytes: e.bytes });
  }

  const top = validatePackEntries(own, '', appVersion);

  const walk = new Walk(groups);
  const includes = top.manifest.includes.map((i) => [i.id, i.version]);
  walk.visit(includes, [top.manifest.id]);
  const order = walk.order;

  const unused = [...groups.keys()].filter((id) => !order.includes(id));
  unused.push(...strays);
  unused.sort();
  if (unused.length > 0) throw new PackError('PACK_INCLUDE_UNUSED', { id: unused[0] });

  const included = [];
  for (const id of order) {
    const folder = `packs/${id}/`;
    try {
      included.push(validatePackEntries(groups.get(id), folder, appVersion));
    } catch (err) {
      throw err.inFolder(folder);
    }
  }
  return { top, included, all: () => [top, ...included] };
}

export async function validateZipFile(path, appVersion) {
  return validateEntries(await readZipFile(path), appVersion);
}

export async function validateZipBuffer(buffer, appVersion) {
  return validateEntries(await readZip(buffer), appVersion);
}

export async function validateFolder(root, appVersion) {
  return validateEntries(await readFolder(root), appVersion);
}
