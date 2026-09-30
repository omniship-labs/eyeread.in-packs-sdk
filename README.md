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
| `packages/eyeread.in-packs`        | CLI: `npx @omniship-labs/eyeread.in-packs validate` / `build` / `submit`                                    |
| `packages/create-eyeread.in-packs` | Scaffold: `npm create @omniship-labs/eyeread.in-packs my-pack`                                              |
| `packages/eyeread.in-packs-types`  | Editor autocomplete for the `eyeread.*` API                                                                 |
| `docs/PACK_AUTHORING.md`           | The pack-writing rules, for any AI coding agent or human                                                    |

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

## Letting an AI agent write the pack for you

The scaffold above writes an `AGENTS.md` into every new pack folder — the sandbox
rules, the manifest fields, the `eyeread.on(...)` handler shape, and the
`validate`/`build` workflow, all in one self-contained file. It's plain
Markdown with no tool-specific format, so **any** coding agent that reads
project files (Claude Code, Cursor, Codex, Copilot, …) picks it up automatically
once it's working inside that folder — there's nothing to install. The same
content lives at [`docs/PACK_AUTHORING.md`](docs/PACK_AUTHORING.md) here, kept
in sync by hand with the spec.

There's also [`.claude/skills/eyeread-packs/`](.claude/skills/eyeread-packs) — a proper Skill
(with the full spec bundled as references) that triggers automatically on pack-related requests
even outside a scaffolded folder, e.g. while working in this SDK repo itself, or before a pack
folder exists yet. Install it into any of the 75+ agents
[`skills`](https://github.com/vercel-labs/skills) supports (not just Claude Code) with no checkout
of this repo:

```bash
npx skills add https://github.com/omniship-labs/eyeread.in-packs-sdk/tree/main/.claude/skills/eyeread-packs
```

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
`apiVersion`), via [`.github/workflows/publish.yml`](.github/workflows/publish.yml):

1. Bump every package to the same version and commit it:
   `npm version 0.1.0 --workspaces --no-git-tag-version`.
2. Push a `vX.Y.Z` tag. The workflow runs the tests, refuses to continue if any package's version
   doesn't match the tag, and **stages** all three on npm with provenance.
3. A maintainer approves each staged version on npmjs.com with 2FA (or `npm stage list`, then
   `npm stage approve <stage-id>`). Only then does it go live on npm's `latest` tag.

See the comment at the top of `publish.yml` for the npm trusted-publisher setup each package name
needs once, first (a human, on npmjs.com — this can't be done from CI).

## Contributing

Pull requests need the [CLA](CLA.md) signed — the same one covering
[omniship-labs/eyeread.in](https://github.com/omniship-labs/eyeread.in), so
signing once covers both. A bot checks automatically on your first PR.

## License

AGPL-3.0-or-later, the same as eyeread.in. Packs you build with it can use any license; eyeread.in only requires readable source.
Each of the three published packages includes its own copy of `LICENSE` (vendored from the root by
`npm run build`, like `spec/`), so it's self-contained once installed on its own.
