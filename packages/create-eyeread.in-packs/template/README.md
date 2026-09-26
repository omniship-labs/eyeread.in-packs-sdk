# {{NAME}}

A pack for [eyeread.in](https://github.com/omniship-labs/eyeread.in).

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

1. Push this folder to its own repository.
2. Open a pull request against
   [`omniship-labs/eyeread.in-packs`](https://github.com/omniship-labs/eyeread.in-packs)
   with your pack's source. CI runs `validate` and a license check; a CLA and a
   maintainer review follow.
3. Once approved and signed, your pack installs as **✓ Verified**.

## License

This pack must stay AGPL-3.0 (the same license as eyeread.in itself) to be
installable — see [`LICENSE`](LICENSE).
