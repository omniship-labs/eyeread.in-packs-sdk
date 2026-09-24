# eyeread.in packs SDK

The spec and tools for building **packs** for [eyeread.in](https://github.com/omniship-labs/eyeread.in).
Packs are sandboxed add-ons users install into the app. Each one runs only with the permissions,
and the internet access, that the user grants it.

> **Status:** early development. Nothing is published to npm yet. The design is tracked in
> [omniship-labs/eyeread.in#118](https://github.com/omniship-labs/eyeread.in/issues/118).

## What's here

| Path                               | What it is                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `spec/`                            | The pack format: `pack.json` schema, signing layout, `eyeread.*` API types, sandbox protocol, test fixtures |
| `packages/eyeread.in-packs`        | CLI: `npx eyeread.in-packs validate` / `build` (planned)                                                    |
| `packages/create-eyeread.in-packs` | Scaffold: `npm create @omniship-labs/eyeread.in-packs my-pack` (planned)                                    |
| `packages/eyeread.in-packs-types`  | Editor autocomplete for the `eyeread.*` API (planned)                                                       |

The app and these tools both check packs against the spec in `spec/`, using the same fixtures, so
they always agree on what a valid pack is.

## Develop

```bash
npm ci
npm run lint
npm run format:check
npm test
```

## License

AGPL-3.0-or-later, the same as eyeread.in. Packs must also be AGPL-licensed to be installed.
