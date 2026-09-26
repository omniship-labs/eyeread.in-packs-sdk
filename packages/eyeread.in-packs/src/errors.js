// Pack errors. Codes and message templates come straight from the spec
// (`spec/errors.json`), so the app and this CLI print the same thing for the
// same pack. Mirrors the app's src-tauri/src/packs/error.rs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '../spec/errors.json'), 'utf8'));
const templates = { ...spec.validation, ...spec.runtime };

export class PackError extends Error {
  constructor(code, params = {}, message) {
    if (message === undefined) {
      message = templates[code] ?? code;
      for (const [key, value] of Object.entries(params)) {
        message = message.replaceAll(`{${key}}`, String(value));
      }
    }
    super(message);
    this.code = code;
  }

  toString() {
    return `${this.code}: ${this.message}`;
  }

  /** Point a problem inside an included pack at its folder ("packs/<id>/"). */
  inFolder(folder) {
    if (!folder || this.message.startsWith(folder)) return this;
    const message = this.message.startsWith('pack.json')
      ? `${folder}${this.message}`
      : `${folder.replace(/\/$/, '')}: ${this.message}`;
    return new PackError(this.code, {}, message);
  }
}

export function mib(bytes) {
  return `${Math.floor(bytes / (1024 * 1024))} MiB`;
}
