// Reading a pack's files safely, from a `.zip` or a folder (the layout a
// creator's project has on disk). Everything is read into memory first (a
// pack is at most 20 MiB) and every entry is checked before anything is used:
// no path can escape the pack, no link or device file gets through, and the
// limits are enforced on the bytes actually read, not the sizes a zip claims.
// Mirrors the app's src-tauri/src/packs/archive.rs (step 1 of the spec's
// check order).
import { constants as fsConstants, promises as fs } from 'node:fs';
import { join } from 'node:path';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { PackError, mib } from './errors.js';
import { FILES_JSON, fileTypeAllowed, isSkipped, pathIsSafe, SIGNATURE_FILE } from './paths.js';

export const MAX_ZIP_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 500;

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;

function tooLarge() {
  return new PackError('PACK_TOO_LARGE', { limit: mib(MAX_TOTAL_BYTES) });
}

function tooManyFiles() {
  return new PackError('PACK_TOO_MANY_FILES', { limit: MAX_FILES });
}

/** Unix `st_mode & S_IFMT`, or null when the entry wasn't made on Unix. */
function unixKindBits(entry) {
  const hostOs = entry.versionMadeBy >> 8;
  if (hostOs !== 3) return null; // 3 = Unix
  return (entry.externalFileAttributes >>> 16) & 0xffff & S_IFMT;
}

function kindOf(isDirName, modeBits) {
  if (isDirName && (modeBits === null || modeBits === 0 || modeBits === S_IFDIR)) return 'dir';
  if (!isDirName && (modeBits === null || modeBits === 0 || modeBits === S_IFREG))
    return 'file';
  return 'special';
}

// O_NOFOLLOW makes the open itself fail (ELOOP) if the final path component
// is a symlink, instead of silently following it — and reading through one
// handle (rather than a separate stat-then-read, or lstat-then-read, on the
// path) closes the race where the filesystem entry changes between the two.
const NOFOLLOW_READ = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);

async function readFileNoFollow(path, maxBytes) {
  const handle = await fs.open(path, NOFOLLOW_READ);
  try {
    const stat = await handle.stat();
    if (stat.size > maxBytes) throw tooLarge();
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function readEntryBytes(zipfile, entry, limit) {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) return reject(new PackError('PACK_ZIP_INVALID', {}));
      const chunks = [];
      let total = 0;
      let over = false;
      stream.on('data', (chunk) => {
        total += chunk.length;
        if (total > limit) over = true;
        else chunks.push(chunk);
      });
      stream.on('end', () => resolve({ bytes: Buffer.concat(chunks), over }));
      stream.on('error', () => reject(new PackError('PACK_ZIP_INVALID', {})));
    });
  });
}

/** Run the entry checks in the spec's order, then keep only regular files. */
function checkEntries(raw) {
  // Path rule, for every entry (skipped ones too: nothing unsafe gets a pass).
  for (const e of raw) {
    if (e.nameError || !pathIsSafe(e.name)) {
      throw new PackError('PACK_PATH_UNSAFE', { path: e.nameError ?? e.name });
    }
  }
  const kept = raw.filter((e) => !isSkipped(e.name));

  for (const e of kept) {
    if (e.kind === 'special') throw new PackError('PACK_LINK_NOT_ALLOWED', { path: e.name });
  }

  const files = kept.filter((e) => e.kind === 'file');
  if (files.length > MAX_FILES) throw tooManyFiles();

  // Case-insensitive clashes, and a file that is also used as a folder.
  const seen = new Map();
  for (const e of files) {
    const lower = e.name.toLowerCase();
    if (seen.has(lower)) throw new PackError('PACK_PATH_DUPLICATE', { path: e.name });
    seen.set(lower, e.name);
  }
  for (const e of files) {
    let prefix = e.name.toLowerCase();
    let idx;
    while ((idx = prefix.lastIndexOf('/')) !== -1) {
      prefix = prefix.slice(0, idx);
      if (seen.has(prefix)) throw new PackError('PACK_PATH_DUPLICATE', { path: e.name });
    }
  }

  for (const e of files) {
    if (!fileTypeAllowed(e.name)) throw new PackError('PACK_FILE_TYPE', { path: e.name });
  }

  return files
    .map((e) => ({ path: e.name, bytes: e.bytes }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Read a pack from zip bytes. */
export async function readZip(buffer) {
  if (buffer.length > MAX_ZIP_BYTES) throw tooLarge();

  const zipfile = await new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, decodeStrings: false, validateEntrySizes: false },
      (err, zf) => (err ? reject(new PackError('PACK_ZIP_INVALID', {})) : resolve(zf))
    );
  });

  if (zipfile.entryCount > MAX_FILES * 4) {
    zipfile.close();
    throw tooManyFiles();
  }

  const raw = [];
  let total = 0;

  await new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      zipfile.close();
      reject(err);
    };
    zipfile.on('error', () => fail(new PackError('PACK_ZIP_INVALID', {})));
    zipfile.on('end', () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    zipfile.on('entry', async (entry) => {
      try {
        if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
          throw new PackError('PACK_ZIP_INVALID', {});
        }
        const isUtf8 = (entry.generalPurposeBitFlag & 0x800) !== 0;
        let name;
        let nameError = null;
        try {
          name = isUtf8 ? entry.fileName.toString('utf8') : entry.fileName.toString('latin1');
          if (isUtf8 && !Buffer.from(name, 'utf8').equals(entry.fileName))
            throw new Error('not utf8');
        } catch {
          name = null;
          nameError = entry.fileName.toString('latin1');
        }
        const isDirName = (name ?? '').endsWith('/');
        const modeBits = unixKindBits(entry);
        const kind = kindOf(isDirName, modeBits);

        let bytes = Buffer.alloc(0);
        if (kind === 'file' && name !== null) {
          const { bytes: b, over } = await readEntryBytes(zipfile, entry, MAX_FILE_BYTES + 1);
          if (over) {
            throw new PackError('PACK_FILE_TOO_LARGE', {
              path: name,
              limit: mib(MAX_FILE_BYTES),
            });
          }
          total += b.length;
          if (total > MAX_TOTAL_BYTES) throw tooLarge();
          bytes = b;
        }
        raw.push({ name, nameError, kind, bytes });
        zipfile.readEntry();
      } catch (err) {
        fail(err);
      }
    });
    zipfile.readEntry();
  });

  return checkEntries(raw);
}

export async function readZipFile(path) {
  let buffer;
  try {
    buffer = await readFileNoFollow(path, MAX_ZIP_BYTES);
  } catch (err) {
    if (err instanceof PackError) throw err;
    if (err.code === 'ELOOP') throw new PackError('PACK_LINK_NOT_ALLOWED', { path });
    throw new PackError('INSTALL_IO', {}, `Couldn't open the pack`);
  }
  return readZip(buffer);
}

/** Read an unpacked pack folder (a creator's project directory). */
export async function readFolder(root) {
  const raw = [];
  let total = 0;
  const stack = [{ dir: root, prefix: '' }];
  while (stack.length > 0) {
    const { dir, prefix } = stack.pop();
    const items = await fs.readdir(dir, { withFileTypes: false });
    for (const name of items) {
      // A pack folder can be a git repo's root: its .git (a folder, or a file
      // in a worktree or submodule) isn't part of the pack.
      if (prefix === '' && name === '.git') continue;
      const rel = `${prefix}${name}`;
      const full = join(dir, name);
      const meta = await fs.lstat(full); // never follow a link out of the folder
      const kind = meta.isDirectory() ? 'dir' : meta.isFile() ? 'file' : 'special';
      if (raw.length > MAX_FILES * 4) throw tooManyFiles();
      let bytes = Buffer.alloc(0);
      if (kind === 'file' && !isSkipped(rel)) {
        let b;
        try {
          b = await readFileNoFollow(full, MAX_FILE_BYTES);
        } catch (err) {
          if (err instanceof PackError) {
            throw new PackError('PACK_FILE_TOO_LARGE', {
              path: rel,
              limit: mib(MAX_FILE_BYTES),
            });
          }
          if (err.code === 'ELOOP') throw new PackError('PACK_LINK_NOT_ALLOWED', { path: rel });
          throw err;
        }
        total += b.length;
        if (total > MAX_TOTAL_BYTES) throw tooLarge();
        bytes = b;
      }
      if (kind === 'dir' && !isSkipped(rel)) {
        stack.push({ dir: full, prefix: `${rel}/` });
      }
      raw.push({ name: rel, nameError: null, kind, bytes });
    }
  }
  return checkEntries(raw);
}

/** Write a pack's files as a zip, in path order, deterministically. */
export function writeZip(entries) {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    const sorted = [...entries].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0
    );
    const fixedDate = new Date('2020-01-01T00:00:00Z');
    for (const e of sorted) {
      zipfile.addBuffer(Buffer.from(e.bytes), e.path, {
        compress: false, // deterministic bytes regardless of zlib version
        mtime: fixedDate,
        mode: 0o100644,
      });
    }
    const chunks = [];
    zipfile.outputStream.on('data', (c) => chunks.push(c));
    zipfile.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zipfile.outputStream.on('error', reject);
    zipfile.end();
  });
}

export { FILES_JSON, SIGNATURE_FILE };
