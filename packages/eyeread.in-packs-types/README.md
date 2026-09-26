# @omniship-labs/eyeread.in-packs-types

Editor autocomplete for the `eyeread.*` API that [eyeread.in](https://github.com/omniship-labs/eyeread.in)
packs run against.

## Use

```bash
npm install --save-dev @omniship-labs/eyeread.in-packs-types
```

Add it to your pack's `tsconfig.json` (or `jsconfig.json`) so editors pick up the
global `eyeread`:

```json
{
  "compilerOptions": { "types": ["@omniship-labs/eyeread.in-packs-types"] }
}
```

`index.d.ts` here is a generated copy of [`../../spec/eyeread.d.ts`](../../spec/eyeread.d.ts),
the source of truth. Don't edit it directly — edit the spec copy and run
`npm run build` from the repo root.

## License

AGPL-3.0-or-later.
