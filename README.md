# eyeread.in packs SDK

The spec and tools for building **packs** for [eyeread.in](https://github.com/omniship-labs/eyeread.in).
Packs are sandboxed add-ons users install into the app. Each one runs only with the permissions,
and the internet access, that the user grants it.

> **Status:** the spec and the CLI/scaffold/types packages are implemented and tested here.
> Nothing is published to npm yet — that's a one-time, human step (see
> [`.github/workflows/publish.yml`](.github/workflows/publish.yml)). Tracked in
> [omniship-labs/eyeread.in#118](https://github.com/omniship-labs/eyeread.in/issues/118) and
> [omniship-labs/eyeread.in#127](https://github.com/omniship-labs/eyeread.in/issues/127).

## What's here

| Path                               | What it is                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `spec/`                            | The pack format: `pack.json` schema, signing layout, `eyeread.*` API types, sandbox protocol, test fixtures |
| `packages/eyeread.in-packs`        | CLI: `npx @omniship-labs/eyeread.in-packs validate` / `build`                                               |
| `packages/create-eyeread.in-packs` | Scaffold: `npm create @omniship-labs/eyeread.in-packs my-pack`                                              |
| `packages/eyeread.in-packs-types`  | Editor autocomplete for the `eyeread.*` API                                                                 |

The app and these tools both check packs against the spec in `spec/`, using the same fixtures, so
they always agree on what a valid pack is — see
`packages/eyeread.in-packs/test/fixtures.test.js`, which re-runs every fixture through the full
installer logic (not just the JSON Schema) and checks the result against
`spec/fixtures/expected.json`, the same file the app's own Rust test suite checks against.

## Try it

```bash
npm create @omniship-labs/eyeread.in-packs my-pack
cd my-pack
npx @omniship-labs/eyeread.in-packs validate
npx @omniship-labs/eyeread.in-packs build
```

(Until these are published, run them from this repo instead:
`node packages/create-eyeread.in-packs/src/index.js my-pack`, then
`node ../../eyeread.in-packs/src/cli.js validate`.)

## Develop

```bash
npm ci
npm run build       # vendors spec/ into the packages that publish a copy of it
npm run lint
npm run format:check
npm test            # this repo's own + each package's tests
npm run test:spec   # spec/ schemas and fixtures agree with each other (vitest)
npm run spec:types  # eyeread.d.ts compiles
```

## Versioning and publishing

Every package here versions and publishes together (the CLI and types both follow the spec's
`apiVersion`), via [`.github/workflows/publish.yml`](.github/workflows/publish.yml) — two channels,
the same pattern as the app repo's stable vs. glimpse builds:

- **stable**, on npm's `latest` tag: bump every package to the same version, commit, then push a
  `vX.Y.Z` tag. The workflow refuses to publish if any package's version doesn't match the tag.
- **dev**, on npm's `dev` tag: every push to `main` publishes automatically as
  `<version>-dev.<short sha>` — no tag, no version bump needed. Try it with
  `npm install @omniship-labs/eyeread.in-packs@dev`.

See the comment at the top of `publish.yml` for the npm trusted-publisher setup each package name
needs once, first (a human, on npmjs.com — this can't be done from CI).

## Contributing

Pull requests need the [CLA](CLA.md) signed — the same one covering
[omniship-labs/eyeread.in](https://github.com/omniship-labs/eyeread.in), so
signing once covers both. A bot checks automatically on your first PR.

## License

AGPL-3.0-or-later, the same as eyeread.in. Packs must also be AGPL-licensed to be installed.
Each of the three published packages includes its own copy of `LICENSE` (vendored from the root by
`npm run build`, like `spec/`), so it's self-contained once installed on its own.
