// Path and file-type rules from the spec (FORMAT.md, "Validation errors").
// Mirrors the app's src-tauri/src/packs/archive.rs so a pack that passes here
// installs.
const MAX_PATH_BYTES = 255;
const MAX_PATH_DEPTH = 16;

const ALLOWED_EXTENSIONS = new Set([
  'js',
  'mjs',
  'json',
  'md',
  'txt',
  'css',
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
]);
const ALLOWED_BARE_NAMES = new Set([
  'LICENSE',
  'COPYING',
  'NOTICE',
  'README',
  'AUTHORS',
  'CHANGELOG',
]);
export const FILES_JSON = 'files.json';
export const SIGNATURE_FILE = 'files.json.minisig';

/** `__MACOSX/…` and `.DS_Store` are Finder noise: never extracted or hashed. */
export function isSkipped(path) {
  return (
    path === '__MACOSX' ||
    path.startsWith('__MACOSX/') ||
    path.split('/').at(-1) === '.DS_Store'
  );
}

function hasControlChar(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20 || s.charCodeAt(i) === 0x7f) return true;
  }
  return false;
}

/**
 * The spec's path rule: relative, `/`-separated, no `.`/`..`/empty segments,
 * no backslash or control characters, bounded length and depth.
 */
export function pathIsSafe(path) {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  if (
    trimmed.length === 0 ||
    Buffer.byteLength(trimmed, 'utf8') > MAX_PATH_BYTES ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    hasControlChar(trimmed)
  ) {
    return false;
  }
  // A drive letter ("C:…") would be absolute on Windows.
  if (trimmed.length >= 2 && trimmed[1] === ':' && /[a-zA-Z]/.test(trimmed[0])) {
    return false;
  }
  const segments = trimmed.split('/');
  return (
    segments.length <= MAX_PATH_DEPTH &&
    segments.every((s) => s.length > 0 && s !== '.' && s !== '..')
  );
}

export function fileTypeAllowed(path) {
  const name = path.split('/').at(-1) ?? path;
  if (name === SIGNATURE_FILE) return true;
  const dot = name.lastIndexOf('.');
  if (dot > 0) {
    return ALLOWED_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
  }
  return ALLOWED_BARE_NAMES.has(name);
}
