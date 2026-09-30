# Agent instructions — {{NAME}}

This is an **eyeread.in pack**: a small, sandboxed JS extension for
[eyeread.in](https://github.com/omniship-labs/eyeread.in) (`{{ID}}`). It isn't a
normal web or Node project — the code in `main.js` runs in a locked-down
sandbox with no DOM, no filesystem, and no network except what `pack.json`
explicitly declares and the user explicitly grants. Read this whole file before
editing anything here; the rules below aren't stylistic preferences, they're
what the installer enforces.

## The contract, in short

- `pack.json` is the manifest — `id`, `version`, `license` and `main` never
  move or get invented ad hoc; unknown fields are rejected outright.
- The pack starts out AGPL-3.0 (`LICENSE` and `license` in `pack.json`). Any
  license is allowed; only change it if the author asks, and then update both
  `license` and `LICENSE` together, using the license's real text.
- `main.js` (or whatever `pack.json`'s `main` names) only talks to the outside
  world through the global `eyeread` object, registered with
  `eyeread.on(permission, handler)` **synchronously at the top of the module**.
  There is no `fetch`, no `require`, no dynamic import of a URL — none of it
  works in this sandbox, so don't write code that assumes it might.
- Only the permissions declared in `pack.json` → `permissions` are available at
  runtime, and only if the user has granted them. `network` under a permission
  is a list of **exact `https://` origins** (no paths, no wildcards, no
  `localhost`, no IPs) — the only hosts that permission's `net.fetch` may call,
  and only once the user switches internet on for it.
- User-facing options go in `pack.json` → `settings` (read with
  `eyeread.settings.get()`), not in code constants, environment variables, or a
  config file of your own — there is no way to ship one.
- The pack's own folder can only contain the file types packs are allowed to
  ship (`.js`, `.mjs`, `.json`, `.md`, `.txt`, `.css`, `.svg`, image types, plus
  `LICENSE`/`README`/etc. with no extension). No `node_modules`, no build
  output, no dotfiles — see the note in `README.md` about keeping a
  `.gitignore` **outside** this folder, not inside it.
- Source must stay readable — no minifying or bundling into dense single-line
  output. Most packs need no build step at all: edit `main.js` directly.

## Full reference

The rules above are the summary; the exact schema, the full `eyeread.*` API per
permission, error codes, and size/format limits are in the
[eyeread.in-packs-sdk spec](https://github.com/omniship-labs/eyeread.in-packs-sdk/tree/main/spec)
— particularly
[`FORMAT.md`](https://github.com/omniship-labs/eyeread.in-packs-sdk/blob/main/spec/FORMAT.md)
(the pack file format) and
[`API.md`](https://github.com/omniship-labs/eyeread.in-packs-sdk/blob/main/spec/API.md)
(what each permission's handler receives). If something here and the spec ever
disagree, the spec wins.

## Check your work

```bash
npx @omniship-labs/eyeread.in-packs validate
```

Run this after every change. It runs the **exact same checks** the app's
installer runs — the same error codes and wording — so treat a failure as
authoritative, not as something to route around or silence. If an error code
isn't self-explanatory, look it up in `errors.json` in the spec linked above
rather than guessing at a fix.

```bash
npx @omniship-labs/eyeread.in-packs build
```

Once `validate` is clean, `build` writes the installable zip
(`{{ID}}-<version>.zip`), with a freshly computed `files.json` inside it. Try
it in the real app via **Settings → Packs → Developer mode** → load this
folder — no build or install step needed for that, it reloads live as you edit
`main.js`.

Getting the pack **Verified** is a separate, public step: see "Publish" in
`README.md`. `npx @omniship-labs/eyeread.in-packs submit` opens a pull request
on the user's behalf (and `--release` publishes a GitHub release), so only run
it when the user asks you to submit the pack.
