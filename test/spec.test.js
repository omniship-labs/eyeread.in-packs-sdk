import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const specDir = new URL('../spec/', import.meta.url);
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, specDir), 'utf8'));

const packSchema = readJson('pack.schema.json');
const filesSchema = readJson('files.schema.json');
const { codes } = readJson('errors.json');
const limits = readJson('limits.json');

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // `anyOf: [{ required: ['main'] }, …]` names properties defined at the top level, which is
  // standard JSON Schema; strictRequired would reject it.
  strictRequired: false,
  allowUnionTypes: true,
});
addFormats(ajv);
ajv.addSchema(packSchema, 'pack.schema.json');
const validatePack = ajv.getSchema('pack.schema.json');
const validateFiles = ajv.compile(filesSchema);

const errorsOf = (validate) => ajv.errorsText(validate.errors, { separator: '\n' });

function loadFixtures(kind) {
  const dir = new URL(`fixtures/${kind}/`, specDir);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({
      name: `${kind}/${f}`,
      ...JSON.parse(readFileSync(new URL(f, dir), 'utf8')),
    }));
}

const valid = loadFixtures('valid');
const invalid = loadFixtures('invalid');

/** Every pack.json in a fixture, including nested bundle members. */
function allPacks(fixture) {
  return [fixture.pack, ...(fixture.packs ?? []).flatMap(allPacks)];
}

describe('schemas', () => {
  test('compile under strict mode', () => {
    assert.equal(typeof validatePack, 'function');
    assert.equal(typeof validateFiles, 'function');
  });

  test('files.json example from signing.md is valid; bad hashes and paths are not', () => {
    const good = {
      formatVersion: 1,
      packId: 'com.example.foot-pedal',
      packVersion: '1.2.0',
      algorithm: 'sha256',
      files: { 'main.js': 'a'.repeat(64), 'packs/com.example.pedal@1.0.0.zip': 'b'.repeat(64) },
    };
    assert.ok(validateFiles(good), errorsOf(validateFiles));
    for (const files of [{ 'main.js': 'XYZ' }, { '../main.js': 'a'.repeat(64) }, {}]) {
      assert.equal(validateFiles({ ...good, files }), false, JSON.stringify(files));
    }
  });
});

describe('fixtures', () => {
  test('there are valid and invalid fixtures', () => {
    assert.ok(valid.length >= 5);
    assert.ok(invalid.length >= 20);
  });

  for (const fixture of [...valid, ...invalid]) {
    test(`${fixture.name} is well-formed`, () => {
      assert.equal(typeof fixture.description, 'string');
      assert.equal(typeof fixture.pack, 'object');
      assert.equal(typeof fixture.expect?.valid, 'boolean');
      if (!fixture.expect.valid) {
        assert.ok(fixture.expect.code in codes, `unknown code ${fixture.expect.code}`);
        assert.ok(['schema', 'package'].includes(fixture.expect.stage));
        assert.equal(codes[fixture.expect.code].stage, fixture.expect.stage);
      }
    });
  }

  for (const fixture of valid) {
    test(`${fixture.name}: every pack.json passes the schema`, () => {
      assert.equal(fixture.expect.valid, true);
      for (const pack of allPacks(fixture))
        assert.ok(validatePack(pack), errorsOf(validatePack));
    });
  }

  for (const fixture of invalid.filter((f) => f.expect.stage === 'schema')) {
    test(`${fixture.name}: pack.json fails the schema (${fixture.expect.code})`, () => {
      assert.equal(validatePack(fixture.pack), false, 'expected schema failure');
    });
  }

  for (const fixture of invalid.filter((f) => f.expect.stage === 'package')) {
    test(`${fixture.name}: pack.json passes the schema, so the failure is package-level`, () => {
      for (const pack of allPacks(fixture))
        assert.ok(validatePack(pack), errorsOf(validatePack));
    });
  }

  test('every schema- and package-stage error code has a fixture', () => {
    const covered = new Set(invalid.map((f) => f.expect.code));
    const missing = Object.entries(codes)
      .filter(([code, { stage }]) => stage !== 'signature' && !covered.has(code))
      .map(([code]) => code)
      // Needs a zip or oversized content that a JSON fixture can't carry.
      .filter((code) => !['manifest_missing', 'manifest_not_json', 'too_large'].includes(code));
    assert.deepEqual(missing, []);
  });

  test('limits match the fixtures that exercise them', () => {
    const tooMany = invalid.find((f) => f.name === 'invalid/too-many-files.json');
    assert.ok(Object.keys(tooMany.files).length + 1 > limits.maxFiles);
    const minified = invalid.find((f) => f.name === 'invalid/minified-code.json');
    const longest = Math.max(...minified.files['main.js'].split('\n').map((l) => l.length));
    assert.ok(longest > limits.minified.maxLineLength);
  });
});

test('eyeread.d.ts and the examples type-check (including every @ts-expect-error)', () => {
  const tsc = fileURLToPath(new URL('../node_modules/.bin/tsc', import.meta.url));
  const root = fileURLToPath(new URL('..', import.meta.url));
  execFileSync(tsc, ['-p', 'tsconfig.json'], { cwd: root, stdio: 'pipe' });
});
