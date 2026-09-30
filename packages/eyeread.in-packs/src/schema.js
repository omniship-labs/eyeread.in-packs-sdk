// pack.schema.json, compiled once. The site regex is read out of the schema
// itself (the `$defs/site` pattern) so this and the schema can't drift.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const specDir = join(here, '../spec');

export const packSchema = JSON.parse(readFileSync(join(specDir, 'pack.schema.json'), 'utf8'));
export const filesSchema = JSON.parse(readFileSync(join(specDir, 'files.schema.json'), 'utf8'));

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  strictTypes: false,
});
ajv.addSchema(packSchema, 'pack.schema.json');
ajv.addSchema(filesSchema, 'files.schema.json');

export const validatePack = ajv.getSchema('pack.schema.json');
export const validateFiles = ajv.getSchema('files.schema.json');

const sitePattern = packSchema.$defs.site.pattern;
const siteRegex = new RegExp(sitePattern);

export function siteIsValid(site) {
  return site.length <= 262 && siteRegex.test(site);
}

export const SUPPORTED_API_VERSIONS = [1];
export const PERMISSIONS = [
  'scripts:write',
  'prompter:load',
  'prompter:control',
  'prompter:events',
  'files:import',
  'input:keyboard',
  'input:mouse',
  'input:midi',
  'input:gamepad',
];

/** Permissions that read the user's input. They can't declare `network`. */
export const isInputPermission = (permission) => permission.startsWith('input:');
