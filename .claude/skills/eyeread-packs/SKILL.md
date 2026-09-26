---
name: eyeread-packs
description: >-
  Write, fix, or validate a pack for eyeread.in — an installable, sandboxed JS
  extension that adds a permission-gated integration (Notion sync, a foot
  pedal, a Stream Deck action, a custom import, etc.) without touching the
  app's own code. Use this whenever the user asks to build, create, scaffold,
  debug, or ship a "pack" or "connected app" for eyeread.in, mentions
  `pack.json`, the `eyeread.*` API, `eyeread.on(...)`, `@omniship-labs/eyeread.in-packs`,
  or a `PACK_*`/`E_*` error code, or wants an existing pack's `validate`/`build`
  failure fixed — even if they don't use the word "pack" and just describe
  wanting eyeread.in to do something it doesn't do out of the box.
---

# Writing an eyeread.in pack

A pack is a small, sandboxed JS extension for eyeread.in. It cannot use
`fetch`, `require`, the DOM, or the filesystem directly — only a global
`eyeread` object, gated by permissions the pack declares in `pack.json` and the
user explicitly grants. Getting this right depends on rules that aren't
guessable from first principles (exact permission names, the manifest schema,
which file types and code shapes the installer accepts), so **read
[`references/PACK_AUTHORING.md`](references/PACK_AUTHORING.md) before writing
or editing any pack code** — it's the full guide: manifest fields, permissions,
declared settings, the `eyeread.on(...)` handler shape per permission, file
rules, and the exact `validate`/`build` workflow.

That file is self-contained (it doesn't assume you're inside any particular
repo), and is also placed as `AGENTS.md` in the root of every pack scaffolded
by `npm create @omniship-labs/eyeread.in-packs` — if you're already working
inside a pack's own folder, check there first; it may already be open in your
context.

## When you need more than the summary

`references/PACK_AUTHORING.md` is a practical summary. For the exact, normative
rules behind any of it:

- [`references/FORMAT.md`](references/FORMAT.md) — the pack file layout,
  `pack.json` fields, path/file-type rules, size limits, bundles.
- [`references/API.md`](references/API.md) — every permission's exact handler
  context, `net.fetch` behavior and limits, all `E_*` error codes.
- [`references/pack.schema.json`](references/pack.schema.json) — the JSON
  Schema `pack.json` is validated against (useful for checking a field's exact
  constraints without guessing).
- [`references/errors.json`](references/errors.json) — every `PACK_*`
  validation error code and its exact message template, for interpreting a
  `validate` failure precisely rather than pattern-matching on wording.
- [`references/eyeread.d.ts`](references/eyeread.d.ts) — TypeScript
  declarations for the full `eyeread.*` API, if you want compile-time checking
  or autocomplete context.

## Installing this skill elsewhere

If you're reading this because it's already loaded, you don't need this
section. To put it in a _different_ environment (any of the 75+ agents
[vercel-labs/skills](https://github.com/vercel-labs/skills) supports, not just
Claude Code — no checkout of this repo needed):

```bash
npx skills add https://github.com/omniship-labs/eyeread.in-packs-sdk/tree/main/.claude/skills/eyeread-packs
```

## The one command that matters most

```bash
npx @omniship-labs/eyeread.in-packs validate
```

This runs the exact checks the real app's installer runs. Run it after every
change to a pack, and trust its answer over your own guess about whether
something is correct — a pack that "looks right" but fails `validate` is not
done. If it 404s, the SDK packages haven't been published yet; scaffold and
validate from a checkout of
[omniship-labs/eyeread.in-packs-sdk](https://github.com/omniship-labs/eyeread.in-packs-sdk)
instead (`node packages/create-eyeread.in-packs/src/index.js`, then
`node packages/eyeread.in-packs/src/cli.js validate <folder>`).
