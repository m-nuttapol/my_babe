# Fonts

Both faces are self-hosted so the pages work offline and make no third-party
request. `../fonts.css` declares them and scopes each by `unicode-range`, so Latin
and Thai each get the right face automatically.

| file | family | used for | licence |
|---|---|---|---|
| `pinyon-script-latin.woff2`, `pinyon-script-latin-ext.woff2` | `Pinyon Script` | Latin display text | SIL OFL — `OFL.txt` |
| `iannnnn-DOG-regular.woff2`, `iannnnn-DOG-bold.woff2` | `iannnnn-DOG` | Thai display text | freeware, f0nt.com |

Pinyon Script came from Google Fonts (the canonical source). iannnnn-DOG came from
https://www.f0nt.com/release/iannnnn-dog/ and was converted from the released ttf
to woff2 — 115KB down to 46KB per weight.

The release also contains a Light weight, deliberately not shipped: nothing here
asks for weight 300, so it would be a download for nothing. Add it as another
`@font-face` at `font-weight: 300` if a design ever needs it.

f0nt.com fonts are free for personal use; check the bundled licence before using
this anywhere commercial.
