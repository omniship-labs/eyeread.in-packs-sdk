# Authoring an eyeread.in pack — agent guide

Canonical, self-contained rules for writing a **pack**: an installable, sandboxed
JS extension for [eyeread.in](https://github.com/omniship-labs/eyeread.in). This
file is written to be read by any AI coding agent (Claude, Cursor, Codex, Copilot,
or a human) working in a pack's own repository — it doesn't assume access to this
SDK repo. The full, normative spec is
[`spec/FORMAT.md`](../spec/FORMAT.md), [`spec/API.md`](../spec/API.md) and
[`spec/pack.schema.json`](../spec/pack.schema.json); this document is a practical
summary of it, kept in sync by hand. When in doubt, or for anything not covered
here, read those files or run `validate` (below) and trust its answer over this
one.

## What a pack is

A pack is a folder (zipped for install) holding a `pack.json` manifest, a
`LICENSE` file, and JS code (`main.js` or similar). The app runs that code in a
**sandbox with no DOM, no network, and no filesystem** — the only way out is a
global `eyeread` object, and only for the permissions the pack declares _and_
the user has granted. There is no way around this from inside pack code: don't
attempt `fetch`, `XMLHttpRequest`, `require('fs')`, dynamic `import()` of a
remote URL, or any other escape — none of it works, and code that tries makes
the pack look broken, not powerful.

## Minimal `pack.json`

```json
{
  "apiVersion": 1,
  "id": "com.example.my-pack",
  "name": "My Pack",
  "version": "0.1.0",
  "author": { "name": "Ada Example" },
  "license": "AGPL-3.0-or-later",
  "main": "main.js",
  "permissions": {
    "scripts:write": {}
  }
}
```

Rules that are easy to get wrong (the schema and installer both reject
anything else, with no partial credit):

- **`id`**: lowercase reverse-DNS, at least one dot, 3–100 chars — `com.example.thing`, never changed after publishing.
- **`version`**: strict semver, no build metadata (`1.2.0`, `2.0.0-beta.1` — not `1.2`, not `1.2.0+build5`).
- **`license`**: exactly `AGPL-3.0-only`, `AGPL-3.0-or-later` or `AGPL-3.0` — nothing else installs. The pack's root must also have a `LICENSE`, `LICENSE.md`, `LICENSE.txt` or `COPYING` file containing the text `GNU AFFERO GENERAL PUBLIC LICENSE` (any letter case). Copy the real AGPL-3.0 text — don't paraphrase or stub it.
- **`main`**: an ES module, `.js` or `.mjs`. It can `import` other files in the pack by relative path; nothing remote. Required unless the pack only bundles other packs (`includes`, no `permissions`).
- **Unknown top-level fields are rejected** — the schema is `additionalProperties: false`. Don't add fields that aren't in the table below.
- **`permissions`**: a map from permission name to `{ "network"?: [sites] }` — see below. Omit permissions the pack doesn't use; declaring one you don't handle in code does nothing harmful, but don't do it.

Full field table (`spec/FORMAT.md` has the exhaustive version): `apiVersion`
(int, `1` today), `id`, `name` (≤64 chars), `version`, `description`
(≤280 chars, optional), `author` (`{name, email?, url?}`), `homepage`/`repository`
(`https://` URLs, optional), `license`, `minAppVersion` (optional), `main`,
`permissions`, `settings` (below), `includes` (bundles — packs this one bundles;
niche, skip unless asked for it).

## Permissions — pick only what the pack needs

| Permission         | Lets the pack…                                             |
| ------------------ | ---------------------------------------------------------- |
| `scripts:write`    | Add a script to the user's library                         |
| `prompter:load`    | Open text in the prompter and start reading it             |
| `prompter:control` | Play/pause/restart/seek/close the open prompter            |
| `prompter:events`  | Read the prompter's live state (word index, playing, etc.) |
| `files:import`     | Ask the user to pick a file via the app's own picker       |

A pack registers **one handler per permission it declares**, via
`eyeread.on(permission, handler)` (below) — declaring a permission with no
handler, or handling one you didn't declare, is a mistake, not a feature.

### Internet access — off by default, declared per permission

```json
"permissions": {
  "scripts:write": { "network": ["https://api.notion.com"] }
}
```

- `network` is a list of **exact origins**: `https://`, lowercase host with at
  least one dot, optional port. **No** paths, wildcards, IP addresses,
  `localhost`, trailing slashes or user info. Up to 16 per permission.
- Declaring a site does **not** turn internet on — the user does that per
  permission, and it starts off. Code must handle `net` being absent/denied
  gracefully (see `E_NETWORK_DENIED` below), not assume it will always work.
- Every permission that declares `network` runs in its **own isolated
  sandbox** with only that permission's context; permissions without `network`
  share one offline sandbox. They can't share memory or call each other — write
  each handler as if it's the only code in the pack.

## Declared settings

User-editable options, shown in the app's own Settings UI, read at runtime with
`eyeread.settings.get()`. Don't invent your own settings storage or config file —
this is the only mechanism, and it's what the user actually sees and edits.

```json
"settings": [
  { "key": "pageId", "type": "text", "label": "Notion page ID", "maxLength": 100 },
  { "key": "autoOpen", "type": "toggle", "label": "Open after import", "default": true }
]
```

| `type`   | Extra fields                                                     | Value     | Default when omitted |
| -------- | ---------------------------------------------------------------- | --------- | -------------------- |
| `toggle` | —                                                                | `boolean` | `false`              |
| `select` | `options`: 1–50 of `{value, label}`                              | `string`  | first option         |
| `number` | `min`?, `max`?, `step`? (>0), `unit`? (≤16 chars)                | `number`  | `min`, else `0`      |
| `text`   | `maxLength`? (1–2000, default 200), `placeholder`?, `multiline`? | `string`  | `""`                 |

`key` is a letter then letters/digits/`_`, ≤64 chars, unique per pack. Up to 32
settings total.

## Writing `main.js`

```js
eyeread.on('scripts:write', async ({ scripts, net, settings }) => {
  const values = await settings.get();
  const res = await net.fetch(`https://api.notion.com/v1/pages/${values.pageId}`, {
    headers: { 'Notion-Version': '2022-06-28' },
  });
  if (!res.ok) throw new Error(`Notion API returned ${res.status}`);
  const text = await res.text();
  await scripts.add({ title: 'From Notion', text });
});
```

- Call `eyeread.on` **at the top level of the module**, synchronously, during
  first evaluation — not inside a `setTimeout`, a promise callback, or after an
  `await`. Registrations made later are silently ignored.
- Each handler is called **once**, after the module loads, only if its
  permission is declared and the user has allowed it. It can be `async`.
- The context object depends on the permission (see the table in
  [`spec/API.md`](../spec/API.md) for the exact shape of each); every context
  also gets `settings`, and `net` only when that permission declared `network`.
- `eyeread.settings.onChange(callback)` fires when the user edits a setting —
  use it instead of polling.
- No `localStorage`/`IndexedDB`/cookies; keep state in settings or in memory.
- Log with `console.log`/`warn`/`error` — it shows up in the pack's log panel in
  Developer mode. Don't build custom logging.
- `net.fetch` errors reject with an `Error` that has a `.code` — check `err.code`
  (`E_NETWORK_DENIED`, `E_TIMEOUT`, `E_TOO_LARGE`, `E_RATE_LIMITED`, …), don't
  match on `err.message` text.
- HTTP error statuses (404, 500…) are **not** thrown — `res.ok` is `false`;
  check it explicitly, the way the example above does.

## File rules (why `validate` might reject an otherwise-correct pack)

- **Allowed file types only**: `.js`, `.mjs`, `.json`, `.md`, `.txt`, `.css`,
  `.svg`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, plus extensionless
  `LICENSE`, `COPYING`, `NOTICE`, `README`, `AUTHORS`, `CHANGELOG`. No `.html`,
  no `.wasm`, no native binaries, no `.ts` (compile TypeScript to `.js` before
  shipping — a pack ships plain JS).
- **No build tooling artifacts in the shipped pack**: no `node_modules`,
  `package.json` isn't part of the pack format (keep your own dev tooling
  outside the folder that gets validated/built — see the note in the scaffold's
  own README about not putting a `.gitignore` inside the pack root, for the same
  reason: only the allowed file types above may exist there at all).
- **Readable source, not minified**: a `.js`/`.mjs` file is rejected if any
  line is over 1000 characters, or if it's ≥2048 bytes and averages over 200
  bytes/line. Don't run a minifier or bundler that produces dense single-line
  output; ship the code as written (a bundler that preserves readable
  multi-line output, e.g. with no minification pass, is fine if you use one at
  all — most packs don't need one).
- **Safe relative paths only**: no `..`, no absolute paths, no backslashes, ≤255
  bytes, ≤16 segments deep. No symlinks.
- **Size limits**: 20 MiB total (zipped and unzipped), 5 MiB per file, 500 files
  max. Packs are small; if you're near these limits, something's wrong.

## Check it, build it

```bash
npx @omniship-labs/eyeread.in-packs validate   # run this after every change
npx @omniship-labs/eyeread.in-packs build       # writes <id>-<version>.zip, with files.json
```

`validate` runs the **exact same checks** the app's installer runs (same spec,
same error codes and wording) — treat a `validate` failure as authoritative, not
as something to route around. Its error codes match
[`spec/errors.json`](../spec/errors.json) 1:1 (`PACK_LICENSE_FILE`,
`PACK_MINIFIED`, `PACK_NETWORK_SITE`, `PACK_MANIFEST_SCHEMA`, …) — if you don't
recognize a code, that file has the exact wording and
[`spec/FORMAT.md`](../spec/FORMAT.md) explains the rule behind it. Don't guess
at a fix from the message alone if the code isn't obvious; read the rule.

If neither command is installed yet: `npm install --save-dev @omniship-labs/eyeread.in-packs`
(or run via `npx`, which fetches it on demand once it's published — see the SDK
repo's README if it 404s, that means the package isn't published yet).

## Workflow for an agent asked to "build a pack that does X"

1. Scaffold: `npm create @omniship-labs/eyeread.in-packs my-pack` (prompts for
   name/id/author/permission; non-interactively it fills in sensible defaults).
2. Pick the **smallest set of permissions** that does the job — don't declare
   `files:import` "just in case." Add `network` sites only for hosts the code
   actually calls.
3. Write `main.js` against the permission's context shape (see `spec/API.md`).
4. Add any user-facing options as declared `settings`, not hardcoded constants.
5. `validate`. Fix whatever it reports, in the order it reports it — later
   checks don't run until earlier ones pass, so don't try to fix everything at
   once from a stale error list.
6. `build` once `validate` is clean, to confirm the zip itself is well-formed.
7. Tell the user how to try it: eyeread.in → **Settings → Packs → Developer
   mode** → load the pack's folder (no store submission needed to test locally).
