// files.json: a pack's per-file SHA-256 list, and the pack hash (the SHA-256
// of that list in canonical form). Mirrors the app's
// src-tauri/src/packs/files_list.rs.
import { createHash } from 'node:crypto';
import { PackError } from './errors.js';
import { FILES_JSON, SIGNATURE_FILE } from './paths.js';

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Is this path hashed? Everything but the list itself and its signature. */
export function isHashed(path) {
  return path !== FILES_JSON && path !== SIGNATURE_FILE;
}

/** Hash one pack's files, as they are. */
export function computeFilesList(id, version, entries) {
  const files = {};
  for (const e of [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  )) {
    if (isHashed(e.path)) files[e.path] = sha256Hex(e.bytes);
  }
  return { format: 1, id, version, files };
}

/** Canonical bytes: `JSON.stringify(value, null, 2) + "\n"`. */
export function canonicalBytes(list) {
  const sortedFiles = Object.fromEntries(
    Object.entries(list.files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  const canonical = {
    format: list.format,
    id: list.id,
    version: list.version,
    files: sortedFiles,
  };
  return Buffer.from(JSON.stringify(canonical, null, 2) + '\n', 'utf8');
}

export function packHash(list) {
  return sha256Hex(canonicalBytes(list));
}

/** Parse and check a shipped `files.json` against the manifest. */
export function parseFilesList(bytes, id, version) {
  const invalid = (detail) => new PackError('PACK_FILES_JSON_INVALID', { detail });
  let list;
  try {
    list = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (e) {
    throw invalid(e.message);
  }
  if (list.format !== 1) throw invalid('format must be 1');
  if (list.id !== id || list.version !== version)
    throw invalid('id and version must match pack.json');
  const entries = Object.entries(list.files ?? {});
  if (entries.length === 0) throw invalid('files must list at least one file');
  for (const [path, hash] of entries) {
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
      throw invalid(`${path}: hash must be 64 lowercase hex characters`);
    }
  }
  return { format: list.format, id: list.id, version: list.version, files: list.files };
}

/**
 * The first difference between the expected list and the files present, in
 * path order, as `PACK_FILES_MISMATCH`. `prefix` is prepended to paths (an
 * included pack's folder).
 */
export function compareFilesLists(want, actual, prefix) {
  const paths = [...new Set([...Object.keys(want.files), ...Object.keys(actual.files)])].sort();
  for (const path of paths) {
    const w = want.files[path];
    const a = actual.files[path];
    let detail;
    if (w !== undefined && a === undefined)
      detail = 'listed in files.json but missing from the pack';
    else if (w === undefined && a !== undefined) detail = 'not listed in files.json';
    else if (w !== a) detail = "contents don't match files.json";
    else continue;
    throw new PackError('PACK_FILES_MISMATCH', { path: `${prefix}${path}`, detail });
  }
}
