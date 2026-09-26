// `eyeread.in-packs build`: turn a pack's source folder into the zip the app
// installs, with a freshly computed `files.json` per pack (FORMAT.md:
// "optional: per-file SHA-256 list (the build tool writes it)"). Deterministic:
// the same input folder always produces the same output bytes (no timestamps
// or filesystem order leak into the zip).
import { FILES_JSON, readFolder, SIGNATURE_FILE, writeZip } from './archive.js';
import { canonicalBytes } from './filesList.js';
import { validateEntries } from './validate.js';

/**
 * @param {string} root pack source folder
 * @param {import('semver').SemVer | string | undefined} appVersion optional
 *   target app version, for the `minAppVersion` check
 * @returns {Promise<{bytes: Buffer, bundle: import('./validate.js').ValidatedBundle}>}
 */
export async function buildPack(root, appVersion) {
  const raw = await readFolder(root);
  // A stale files.json/signature from a previous build would otherwise be
  // checked against the freshly computed one and fail; the build always
  // regenerates them, so drop anything already there first.
  const stripped = raw.filter((e) => {
    const name = e.path.split('/').at(-1);
    return name !== FILES_JSON && name !== SIGNATURE_FILE;
  });

  const bundle = validateEntries(stripped, appVersion);

  const outEntries = [
    ...bundle.top.entries,
    { path: FILES_JSON, bytes: canonicalBytes(bundle.top.files) },
  ];
  for (const pack of bundle.included) {
    const prefix = `packs/${pack.manifest.id}/`;
    for (const e of pack.entries)
      outEntries.push({ path: `${prefix}${e.path}`, bytes: e.bytes });
    outEntries.push({ path: `${prefix}${FILES_JSON}`, bytes: canonicalBytes(pack.files) });
  }

  const bytes = await writeZip(outEntries);
  return { bytes, bundle };
}
