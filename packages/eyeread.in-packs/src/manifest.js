// pack.json: parsing and checking a manifest against pack.schema.json, plus
// the rules a schema can't express. Mirrors the app's
// src-tauri/src/packs/manifest.rs (steps 2-6 of the spec's check order).
import semver from 'semver';
import { PackError } from './errors.js';
import {
  PERMISSIONS,
  SUPPORTED_API_VERSIONS,
  isInputPermission,
  siteIsValid,
  validatePack,
} from './schema.js';

export { PERMISSIONS };

/** Permissions in the spec's canonical order, that this manifest declares. */
export function permissionNames(manifest) {
  return PERMISSIONS.filter((p) => Object.hasOwn(manifest.permissions ?? {}, p));
}

function schemaErrorPointer(err) {
  const pointer = err.instancePath || '/';
  return pointer;
}

/**
 * Parse `pack.json` bytes and run the spec's checks: readable JSON,
 * `apiVersion`, network sites, the schema, then app version and
 * settings.
 */
export function parseManifest(bytes, appVersion) {
  let value;
  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (e) {
    throw new PackError('PACK_MANIFEST_INVALID_JSON', { detail: e.message });
  }

  if (typeof value?.apiVersion === 'number' && Number.isInteger(value.apiVersion)) {
    if (!SUPPORTED_API_VERSIONS.includes(value.apiVersion)) {
      throw new PackError('PACK_API_VERSION', {
        apiVersion: value.apiVersion,
        supported: SUPPORTED_API_VERSIONS.join(', '),
      });
    }
  }
  if (value?.permissions && typeof value.permissions === 'object') {
    for (const [permission, decl] of Object.entries(value.permissions)) {
      const sites = Array.isArray(decl?.network) ? decl.network : [];
      for (const site of sites) {
        if (typeof site === 'string' && !siteIsValid(site)) {
          throw new PackError('PACK_NETWORK_SITE', { site, permission });
        }
      }
    }
  }

  if (value?.permissions && typeof value.permissions === 'object') {
    for (const [permission, decl] of Object.entries(value.permissions)) {
      checkPermissionOptions(permission, decl);
    }
  }

  if (!validatePack(value)) {
    const err = validatePack.errors[0];
    throw new PackError('PACK_MANIFEST_SCHEMA', {
      pointer: schemaErrorPointer(err),
      detail: err.message,
    });
  }

  const manifest = {
    apiVersion: value.apiVersion,
    id: value.id,
    name: value.name,
    version: value.version,
    description: value.description,
    author: value.author,
    homepage: value.homepage,
    repository: value.repository,
    license: value.license,
    minAppVersion: value.minAppVersion,
    main: value.main,
    permissions: value.permissions ?? {},
    settings: value.settings ?? [],
    includes: value.includes ?? [],
  };

  if (manifest.minAppVersion && appVersion) {
    // The schema already checked the format.
    if (semver.valid(manifest.minAppVersion) && semver.lt(appVersion, manifest.minAppVersion)) {
      throw new PackError('PACK_APP_VERSION', { minAppVersion: manifest.minAppVersion });
    }
  }
  checkSettings(manifest.settings);
  return manifest;
}

// Input permissions can't declare `network`, and each option belongs to
// particular permissions. The schema can't say either.
function checkPermissionOptions(permission, decl) {
  if (!decl || typeof decl !== 'object' || Array.isArray(decl)) return;
  const input = isInputPermission(permission);
  if (input && Object.hasOwn(decl, 'network')) {
    throw new PackError('PACK_INPUT_NETWORK', { permission });
  }
  for (const option of Object.keys(decl)) {
    const allowed =
      option === 'scope'
        ? input
        : option === 'keys'
          ? permission === 'input:keyboard'
          : option === 'buttons' || option === 'position'
            ? permission === 'input:mouse'
            : true; // network, and unknown fields (the schema rejects those)
    if (!allowed) throw new PackError('PACK_PERMISSION_OPTION', { permission, option });
  }
}

function checkSettings(settings) {
  const keys = new Set();
  for (const s of settings) {
    const fail = (detail) => new PackError('PACK_SETTINGS', { key: s.key, detail });
    if (keys.has(s.key)) throw fail('the key is used by another setting');
    keys.add(s.key);
    switch (s.type) {
      case 'toggle':
      case 'key':
        break;
      case 'select': {
        const values = new Set();
        for (const o of s.options ?? []) {
          if (values.has(o.value)) throw fail('option values must be unique');
          values.add(o.value);
        }
        if (s.default !== undefined && !values.has(s.default)) {
          throw fail('default must be one of the options');
        }
        break;
      }
      case 'number': {
        const { min, max, default: def } = s;
        if (min !== undefined && max !== undefined && min > max) {
          throw fail('min must not be greater than max');
        }
        if (
          def !== undefined &&
          ((min !== undefined && def < min) || (max !== undefined && def > max))
        ) {
          throw fail('default must be within min and max');
        }
        break;
      }
      case 'text': {
        const limit = s.maxLength ?? 200;
        if (s.default !== undefined && [...s.default].length > limit) {
          throw fail('default is longer than maxLength');
        }
        break;
      }
    }
  }
}
