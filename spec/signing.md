# Pack layout, hashes and signatures

## Zip layout

```
my-pack-1.2.0.zip
├── pack.json              required
├── main.js                (or whatever "main" names)
├── …                      any other files: readable source, assets, LICENSE
├── packs/                 bundles only: one zip per "includes" entry
│   └── com.example.pedal@1.0.0.zip
├── files.json             optional; required for Verified
└── files.json.minisig     optional; the OmniShip signature over files.json
```

- Paths are relative, use `/`, and never contain `..` segments, absolute paths, backslashes,
  symlinks or special files. Limits are in `limits.json`.
- An included pack is a complete pack zip in its own right, signed or not, and is verified on its
  own. It's installed once and shared if several bundles include the same `id@version`.

## files.json

Validated by `files.schema.json`:

```json
{
  "formatVersion": 1,
  "packId": "com.example.foot-pedal",
  "packVersion": "1.2.0",
  "algorithm": "sha256",
  "files": {
    "LICENSE": "<64 lowercase hex chars>",
    "main.js": "…",
    "pack.json": "…",
    "packs/com.example.pedal@1.0.0.zip": "…"
  }
}
```

It lists **every** file in the zip except `files.json` and `files.json.minisig`. `build` writes it
deterministically: keys sorted, 2-space indent, trailing newline.

## Signature

`files.json.minisig` is a [minisign](https://jedisct1.github.io/minisign/) signature (Ed25519)
over the exact bytes of `files.json`. Its trusted comment is:

```
eyeread.in-pack <packId>@<packVersion>
```

The app embeds **two** OmniShip public keys (main plus an offline backup), so a key can be
rotated without an emergency release. Signing happens offline after review
(omniship-labs/eyeread.in#121, #128), never in CI.

## Verification (in this order)

1. `files.json` validates against `files.schema.json`, and its `packId`/`packVersion` equal
   `pack.json`'s `id`/`version`. Otherwise: `files_manifest_mismatch`.
2. Every file in the zip is listed (`file_not_listed`), every listed file exists (`file_missing`),
   and every SHA-256 matches (`hash_mismatch`).
3. If `files.json.minisig` exists, it must verify against one of the embedded keys **and** its
   trusted comment must match step 1. Otherwise: `signature_invalid`.
4. The SHA-256 of `files.json` must not be on the revocation list (`revoked`).

**Result:**

- **Verified:** all four pass with a signature, and every included pack is Verified too.
- **Community:** no signature, and steps 1–2 pass (or there's no `files.json` at all). The user
  sees the unreviewed-pack warning.
- **Invalid:** anything else. It isn't installed.

At every launch, installed files are re-hashed against the stored `files.json` (generated at
install time for Community packs that shipped without one). Any difference disables the pack.
