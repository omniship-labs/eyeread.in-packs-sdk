# Pack spec (apiVersion 1)

The single source of truth for what an eyeread.in pack is. Both the app's validator
(omniship-labs/eyeread.in#120) and the `eyeread.in-packs` CLI (#127) implement this, and both must
pass the same fixtures.

| File                | What it defines                                                                         |
| ------------------- | --------------------------------------------------------------------------------------- |
| `pack.schema.json`  | `pack.json`: identity, license, permissions, per-permission network, settings, includes |
| `files.schema.json` | `files.json`: the per-file SHA-256 list that gets signed                                |
| `signing.md`        | Zip layout, bundles, signature format, verification order                               |
| `limits.json`       | Size, count, depth and minified-code limits                                             |
| `errors.json`       | Stable validation error codes and the stage that raises them                            |
| `eyeread.d.ts`      | The `eyeread.*` API pack code runs against                                              |
| `protocol.md`       | The app ↔ sandbox message protocol behind that API                                      |
| `fixtures/`         | Valid and invalid packs, with the expected result                                       |
| `examples/`         | Type-checked example pack code                                                          |

## Rules in one place

- **License:** `AGPL-3.0-only` or `AGPL-3.0-or-later`. Source must be readable, not minified.
- **Permissions:** `scripts:write`, `prompter:load`, `prompter:control`, `prompter:events`,
  `files:import`. None is granted until the user allows it.
- **Internet:** declared per permission as exact `https://` origins, with no wildcards, paths,
  `http`, `localhost` or IP addresses. It stays off until the user turns it on for that permission.
  Each permission with internet runs in its own sandbox.
- **Settings:** declared in `pack.json` and drawn by the app (`toggle`, `select`, `number`, `text`).
- **Bundles:** `includes` lists other packs, shipped as `packs/<id>@<version>.zip`.

## Fixtures

Each fixture is a single JSON file, so any language can build the pack in memory:

```jsonc
{
  "description": "What this case checks",
  "pack": {/* pack.json */},
  "files": { "main.js": "…source…" }, // other files; pack.json is added from "pack"
  "symlinks": { "link.js": "main.js" }, // optional: entries that must be rejected
  "packs": [/* nested fixtures (same shape, without "expect") for bundles */],
  "expect": { "valid": true },
  // or: { "valid": false, "code": "<errors.json code>", "stage": "schema" | "package" }
}
```

- **`stage: "schema"`:** `pack.json` alone must fail `pack.schema.json`.
- **`stage: "package"`:** `pack.json` passes the schema, and the failure comes from the files,
  zip layout or includes. The CLI and the app's validator must report exactly `code`.

This repo's tests check the schema stage and the fixtures' own consistency. Package-stage codes are
checked by each validator's test suite against the same files.

## Versioning

- Additive, backwards-compatible changes (new optional fields, new error codes, new API methods)
  stay on `apiVersion: 1`.
- Anything else needs `apiVersion: 2`. The app keeps supporting older versions it has shipped.
