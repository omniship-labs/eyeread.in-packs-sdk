// `eyeread.in-packs add-signature`: put OmniShip's signature for a reviewed
// version into a pack zip, so copies installed by hand show as Verified.
//
// The signature comes from the catalog (`files.json.minisig` next to the
// entry in eyeread.in-packs). It covers the pack hash, which doesn't include
// `files.json` or the signature, so the pack hash doesn't change. This tool
// can't check the signature itself (the app holds the public keys); it checks
// that the signature was made for this id, version and pack hash, and the app
// does the rest at install.
import { FILES_JSON, SIGNATURE_FILE, writeZip } from './archive.js';
import { canonicalBytes } from './filesList.js';
import { validateEntries } from './validate.js';

/** The trusted comment a pack's signature must carry (same as the app's). */
export function trustedComment(id, version, hash) {
  return `eyeread.in pack ${id}@${version} ${hash}`;
}

/** The trusted comment of a minisign signature file, or null if it isn't one. */
export function readTrustedComment(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length !== 4 || !lines[0].startsWith('untrusted comment:')) return null;
  if (!lines[2].startsWith('trusted comment: ')) return null;
  return lines[2].slice('trusted comment: '.length);
}

/**
 * @param {Array<{path: string, bytes: Buffer}>} entries the zip's files
 * @param {string | Buffer} signature contents of `files.json.minisig`
 * @param {import('semver').SemVer | string | undefined} appVersion
 * @returns {Promise<{bytes: Buffer, bundle: object}>} the zip with the signature
 */
export async function addSignature(entries, signature, appVersion) {
  const bundle = validateEntries(entries, appVersion);
  const { id, version } = bundle.top.manifest;
  const text = signature.toString();
  const comment = readTrustedComment(text);
  if (comment === null) throw new Error("the signature file isn't a minisign signature");
  if (comment !== trustedComment(id, version, bundle.top.packHash)) {
    throw new Error(
      `the signature is for a different pack or version, not ${id}@${version} ` +
        `with pack hash ${bundle.top.packHash}`
    );
  }

  const out = entries.filter((e) => e.path !== SIGNATURE_FILE);
  // The signature is over the canonical files.json, so the zip must carry it.
  if (!out.some((e) => e.path === FILES_JSON)) {
    out.push({ path: FILES_JSON, bytes: canonicalBytes(bundle.top.files) });
  }
  out.push({ path: SIGNATURE_FILE, bytes: Buffer.from(text.trim() + '\n') });
  return { bytes: await writeZip(out), bundle };
}
