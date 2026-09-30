# {{NAME}}

A pack for [eyeread.in](https://github.com/omniship-labs/eyeread.in).

> Using an AI coding agent (Claude Code, Cursor, Codex, Copilot, …) to work on
> this pack? Read [`AGENTS.md`](AGENTS.md) first — it has the sandbox and
> `pack.json` rules the installer enforces, which aren't obvious from the code
> alone.

## Develop

Open eyeread.in → **Settings → Packs → Developer mode**, and load this folder.
Changes to `main.js` reload live; changes to `pack.json` need a reload.

## Check it

```bash
npx @omniship-labs/eyeread.in-packs validate   # checks pack.json, files, licence
npx @omniship-labs/eyeread.in-packs build       # writes {{ID}}-<version>.zip
```

> A pack's own folder can only hold the file types packs are allowed to ship
> (see `spec/FORMAT.md`) — so if you put this folder under git, ignore
> `*.zip`, `files.json` and `files.json.minisig` from **outside** it (in a
> parent `.gitignore`), rather than adding a `.gitignore` inside it.

## Publish

Anyone can share the zip as a Community pack. For **✓ Verified**:

1. Push this folder to a public repository (it can be the repo's root).
2. Commit, then tag the version and push the tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. Submit it. On GitHub, with the [GitHub CLI](https://cli.github.com) logged in:

   ```bash
   npx @omniship-labs/eyeread.in-packs submit --release
   ```

   `--release` creates the GitHub release for the tag with the zip attached
   (leave it off if you've already attached the zip yourself). `submit` checks
   the released zip matches this folder at the tag, then opens a pull request
   against
   [`omniship-labs/eyeread.in-packs`](https://github.com/omniship-labs/eyeread.in-packs).
   CI checks it and a maintainer reviews it.

   Hosting the zip somewhere else? Pass `--url <zip url>`. The URL must
   download directly and never change. Without the GitHub CLI, or with
   `--dry-run`, `submit` prints the entry and a link to add it by hand.

4. Once approved, OmniShip signs it and stores the signature with your entry.
   Add the signature to your zip as `files.json.minisig` and re-upload it, so
   hand-installed copies show as Verified too.

Your code stays in your repo. If the release or its zip disappears, the pack
loses its Verified mark.

## License

This pack starts out under the AGPL-3.0 — see [`LICENSE`](LICENSE). You can
use any license you like: change `license` in `pack.json` and replace
`LICENSE` to match. Whatever the license, eyeread.in requires readable source.
