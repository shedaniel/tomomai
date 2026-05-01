# Fonts

This project ships its own self-hosted fonts under `public/res/fonts/`. The CJK
fonts (Noto Sans JP / TC / SC) are 4–7 MB each, so we slice each into ~20
unicode-range chunks and let the browser fetch only the chunks containing
glyphs that actually paint. Common kanji cluster in the first few chunks; rare
kanji live in the tail. A typical Japanese page fetches ~5 chunks (~1 MB) of
NotoSansJP instead of the full 4 MB file.

## What lives where

| File                                           | Used by                              |
|------------------------------------------------|--------------------------------------|
| `Inter-VariableFont_opsz_wght.woff2`           | next/font (Latin baseline)           |
| `GeistMono-VariableFont_wght.woff2`            | next/font (mono)                     |
| `Murecho-VariableFont_wght.woff2`              | next/font (JP display, preload off)  |
| `NotoSans{JP,TC,SC}-VariableFont_wght.woff2`   | source for subsetting (not served)   |
| `NotoSansJP-{00..19}.woff2`                    | chunks declared in `cjk-fonts.css`   |
| `NotoSansTC-{00..19}.woff2`                    | "                                    |
| `NotoSansSC-{00..19}.woff2`                    | "                                    |

`src/app/cjk-fonts.css` is auto-generated and imported by `src/app/layout.tsx`.
It contains 60 `@font-face` rules — one per chunk — each with an explicit
`unicode-range` listing the codepoints in that chunk. The browser uses those
ranges to decide which woff2 files to fetch.

## How chunking works

Each font has 20 chunks under a single shared family name (e.g. `NotoSansJP`):

```css
@font-face {
  font-family: 'NotoSansJP';
  src: url('/res/fonts/NotoSansJP-00.woff2') format('woff2');
  unicode-range: U+0020-007E, U+3000-303F, ...;  /* backbone */
}
@font-face {
  font-family: 'NotoSansJP';
  src: url('/res/fonts/NotoSansJP-01.woff2') format('woff2');
  unicode-range: U+4E00, U+4E03, ...;  /* most-common kanji */
}
/* ...18 more chunks, decreasing frequency... */
```

`globals.css` references the font once per locale chain:

```css
html[lang="ja"] body {
  --font-sans: var(--font-inter), var(--font-murecho),
               'NotoSansJP', system-ui, sans-serif;
}
```

When a glyph paints, the browser:

1. Picks the matching `@font-face` for `NotoSansJP` whose `unicode-range`
   contains that codepoint.
2. Fetches that chunk's woff2 (once per session).
3. Renders.

If the glyph isn't in any chunk's range (uncommon — `Common ∪ all chunks =
source font`), it falls through to `system-ui`.

## How chunks are ordered

Chunks are ordered by per-language priority so the most-common kanji land in
low-numbered chunks:

- **JP** uses **JIS X 0208 Level 1 + Level 2** byte-code as the priority key
  (lower lead/trail bytes = earlier chunk = more common). JIS X 0208 Level 1
  is roughly frequency-ordered.
- **TC** uses **Big5** byte-code.
- **SC** uses **GB2312** byte-code.

Codepoints not in the relevant codepage end up in the tail chunks.

Chunk 00 is always the Latin / kana / halfwidth-fullwidth / punctuation /
symbols backbone — fetched the first time the family is touched.

## JP-specific: Murecho subtraction

`globals.css` chains `var(--font-murecho)` *before* `'NotoSansJP'` for the
en/ja/ko locales. Anything Murecho can render is served from Murecho and
never falls through to NotoSansJP. The subset script reads Murecho's cmap and
drops every codepoint Murecho covers from NotoSansJP entirely — those glyphs
aren't reachable through the cascade, so including them in NotoSansJP would
just inflate chunks. Murecho's coverage of Latin / kana / common kanji shrinks
NotoSansJP's effective glyph count from ~16 700 to ~12 800.

## How to regenerate

```sh
./scripts/subset-fonts.sh
```

Requirements:

- [`uv`](https://docs.astral.sh/uv/) on `$PATH`. The script invokes
  `uv run --quiet --with fonttools --with brotli --with zopfli python3`,
  so no global Python packages are needed.
- The `*-VariableFont_wght.woff2` source files in `public/res/fonts/`.

The script:

1. Reads each source font's cmap.
2. Builds a per-language priority dict via codepage round-trip.
3. Subtracts Murecho's cmap from JP's working set.
4. Splits each working set into 20 chunks (chunk 0 = backbone, 1..19 = kanji
   sorted by priority then codepoint).
5. Runs `fontTools.subset.Subsetter` once per chunk to emit a woff2.
6. Writes `src/app/cjk-fonts.css` with all `@font-face` rules.

Typical results:

| Source     | Original | Total chunked | Per-chunk range |
|------------|----------|---------------|-----------------|
| NotoSansJP | 4.0 MB   | 4.0 MB        | 45–266 KB       |
| NotoSansTC | 4.9 MB   | 5.9 MB        | 133–399 KB      |
| NotoSansSC | 7.2 MB   | 8.5 MB        | 179–501 KB      |

Aggregate chunked size is *equal to or slightly larger* than the source
because each chunk has its own woff2 header and shared layout-table overhead.
**The whole point is per-page download cost, not on-disk total.** A
representative page only fetches 3–6 chunks of one font. For typical Japanese
content that's ~1 MB instead of 4 MB on first paint.

## Why we don't use next/font for the CJK trio

`next/font/local` doesn't expose a way to declare multiple sources under one
logical family with explicit `unicode-range` per source. Generating raw
`@font-face` rules from the subset script keeps the chunked layout entirely
data-driven — adding a 21st chunk or changing the priority ordering only
needs an edit to `subset-fonts.sh`, not to any TS code.

The chunked woff2 files are served from `public/res/fonts/` directly. They
get the default Next.js static-file caching headers; the filenames are stable
across runs (chunk indices are deterministic), so long-cache works.

## Common gotchas

- **A comma in a font filename breaks `next/font/local`.** The preload tag
  uses `,`; the `@font-face url()` uses `%2C`; the browser fetches both as
  distinct resources. Use underscores (`Inter-VariableFont_opsz_wght.woff2`,
  not `…opsz,wght.woff2`).
- **The 60 chunked woff2 files must ship.** If you `.gitignore` them, deploy
  builds will 404. The `*-VariableFont_wght.woff2` originals are only used by
  the subset script — they don't need to ship to production but currently do
  because `src/lib/render-image-server.ts` loads NotoSansJP for skia-canvas.
- **Don't hand-edit `src/app/cjk-fonts.css`.** It's regenerated wholesale by
  the subset script.
- **Adding a glyph not in JIS / Big5 / GB2312 lands in a tail chunk.** That's
  fine — the browser still picks the right chunk via `unicode-range`. If you
  want it in chunk 00 (always fetched), extend the backbone ranges in the
  script.
