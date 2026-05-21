#!/usr/bin/env bash
# Slice each CJK font into ~20 frequency-ordered chunks and emit @font-face
# rules with explicit unicode-range so the browser only fetches a chunk when
# a glyph it covers actually paints.
#
# Chunk 0 is the Latin/kana/symbols/punctuation backbone. Chunks 1..N-1 are
# kanji partitioned by per-language priority: lower JIS / Big5 / GB2312
# byte-code = earlier chunk = higher chance of being fetched. Common kanji
# cluster in the first few chunks so a typical page only fetches a handful.
#
# JP is special-cased: every codepoint Murecho already covers is dropped
# from NotoSansJP entirely (the en/ja/ko CSS chain places Murecho before
# NotoSansJP, so those glyphs would never resolve from JP anyway).
#
# Outputs:
#   public/res/fonts/NotoSans{JP,TC,SC}-{00..19}.woff2
#   src/app/cjk-fonts.css          (auto-generated, imported by layout.tsx)
#
# Re-run after upgrading any source NotoSans*-VariableFont_wght.woff2 or
# Murecho-VariableFont_wght.woff2. Requires `uv` on PATH.

set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

# Drop superseded outputs so stale chunks can't linger.
rm -f public/res/fonts/NotoSans{JP,TC,SC}-Common.woff2 \
      public/res/fonts/NotoSans{JP,TC,SC}-Rare.woff2 \
      public/res/fonts/NotoSans{JP,TC,SC}-[0-9][0-9].woff2

uv run --quiet --with fonttools --with brotli --with zopfli python3 - <<'PY'
import os
from fontTools.ttLib import TTFont
from fontTools.subset import Options, Subsetter

NUM_CHUNKS = 20
FONT_DIR = 'public/res/fonts'
CSS_OUT = 'src/app/cjk-fonts.css'

def cmap(path):
    cps = set()
    for table in TTFont(path)['cmap'].tables:
        cps.update(table.cmap.keys())
    return cps

# Backbone: Latin / kana / forms / punctuation / common symbols. Always
# fetched first (in chunk 0) when the font family is touched at all.
backbone = set()
for lo, hi in [
    (0x0020, 0x007E), (0x00A0, 0x00FF),
    (0x2000, 0x206F), (0x2150, 0x218F),
    (0x2190, 0x21FF), (0x2200, 0x22FF),
    (0x25A0, 0x25FF), (0x2600, 0x26FF),
    (0x3000, 0x303F), (0x3040, 0x309F),
    (0x30A0, 0x30FF), (0x31F0, 0x31FF),
    (0xFF00, 0xFFEF),
]:
    backbone.update(range(lo, hi + 1))

def codepage_priority(codec, leads):
    """Build {codepoint: priority} via codepage round-trip; lower = more common."""
    pri = {}
    for hi in leads:
        for lo in range(0x40, 0xFD):
            try:
                ch = bytes([hi, lo]).decode(codec)
            except UnicodeDecodeError:
                continue
            if len(ch) == 1 and ord(ch) not in pri:
                pri[ord(ch)] = (hi << 8) | lo
    return pri

# JIS X 0208 Level 1 + Level 2 (frequency-meaningful ordering)
jis_pri = codepage_priority('cp932', list(range(0x81, 0xA0)) + list(range(0xE0, 0xEB)))
# Big5
big5_pri = {}
for hi in range(0xA1, 0xFE):
    for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFE)):
        try:
            ch = bytes([hi, lo]).decode('big5')
        except UnicodeDecodeError:
            continue
        if len(ch) == 1 and ord(ch) not in big5_pri:
            big5_pri[ord(ch)] = (hi << 8) | lo
# GB2312
gb_pri = {}
for hi in range(0xA1, 0xFE):
    for lo in range(0xA1, 0xFE):
        try:
            ch = bytes([hi, lo]).decode('gb2312')
        except UnicodeDecodeError:
            continue
        if len(ch) == 1 and ord(ch) not in gb_pri:
            gb_pri[ord(ch)] = (hi << 8) | lo

murecho_cps = cmap(f'{FONT_DIR}/Murecho-VariableFont_wght.woff2')

def split_chunks(font_cps, priority, exclude=frozenset()):
    """Return list[set[int]] of NUM_CHUNKS sets (some may be empty)."""
    avail = font_cps - exclude
    bb = backbone & avail
    rest = avail - bb
    rest_sorted = sorted(rest, key=lambda c: (priority.get(c, 1 << 24), c))
    n = NUM_CHUNKS - 1  # one slot reserved for backbone
    bucket = max(1, (len(rest_sorted) + n - 1) // n)
    chunks = [bb]
    for i in range(n):
        chunks.append(set(rest_sorted[i * bucket:(i + 1) * bucket]))
    return chunks

def fmt_unicode_range(cps):
    """Compress a sorted codepoint list into a CSS unicode-range string."""
    cps = sorted(cps)
    if not cps:
        return ''
    parts = []
    start = end = cps[0]
    for cp in cps[1:]:
        if cp == end + 1:
            end = cp
        else:
            parts.append(f'U+{start:X}' if start == end else f'U+{start:X}-{end:X}')
            start = end = cp
    parts.append(f'U+{start:X}' if start == end else f'U+{start:X}-{end:X}')
    return ', '.join(parts)

def subset_chunk(src, cps, out_path):
    options = Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    options.notdef_glyph = True
    options.notdef_outline = True
    options.recommended_glyphs = True
    font = TTFont(src)
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=list(cps))
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(out_path)

def build(src, family, prefix, priority, exclude=frozenset()):
    font_cps = cmap(src)
    chunks = split_chunks(font_cps, priority, exclude)
    css = []
    total_size = 0
    print(f'▶ {family}  (font cps: {len(font_cps)}, after Murecho-cut: {len(font_cps - exclude)})')
    for i, cps in enumerate(chunks):
        if not cps:
            continue
        out = f'{FONT_DIR}/{prefix}-{i:02d}.woff2'
        subset_chunk(src, cps, out)
        size = os.path.getsize(out)
        total_size += size
        ur = fmt_unicode_range(cps)
        css.append(
            f"@font-face {{\n"
            f"  font-family: '{family}';\n"
            f"  font-display: swap;\n"
            f"  font-weight: 100 900;\n"
            f"  src: url('/res/fonts/{prefix}-{i:02d}.woff2') format('woff2');\n"
            f"  unicode-range: {ur};\n"
            f"}}"
        )
        print(f'  chunk {i:02d}: {len(cps):>5} cps  {size//1024:>4} KB')
    print(f'  total: {total_size//1024} KB across {len(css)} chunks')
    return css

jp_css = build(f'{FONT_DIR}/NotoSansJP-VariableFont_wght.woff2', 'NotoSansJP', 'NotoSansJP', jis_pri, murecho_cps)
tc_css = build(f'{FONT_DIR}/NotoSansTC-VariableFont_wght.woff2', 'NotoSansTC', 'NotoSansTC', big5_pri)
sc_css = build(f'{FONT_DIR}/NotoSansSC-VariableFont_wght.woff2', 'NotoSansSC', 'NotoSansSC', gb_pri)

with open(CSS_OUT, 'w') as f:
    f.write('/* Auto-generated by scripts/subset-fonts.sh — do not edit by hand. */\n\n')
    f.write('\n\n'.join(jp_css + tc_css + sc_css) + '\n')

print(f'\n✓ wrote {CSS_OUT}')
PY
