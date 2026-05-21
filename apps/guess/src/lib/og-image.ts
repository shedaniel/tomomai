import sharp from "sharp";
import { pixelate } from "./image";
import { getToday } from "./today";
import { HINTS } from "./hints-registry";
import { isHeardle } from "./heardle-config";

const OG_SIZE = 1200;

/**
 * Render the OpenGraph cover image for a given (optional) past date.
 *
 * - Guess mode: uses step 0 of the day's plan (the most-obfuscated cover
 *   hint) upscaled to OG dimensions. Image hints intentionally leak no
 *   recognisable detail.
 * - Heardle mode: the cover is never a hint (the player only ever hears
 *   audio), so showing it on the social card would spoil the answer.
 *   Renders a branded blank instead.
 */
export async function renderOgImage(dateOverride?: string): Promise<Response> {
  if (isHeardle()) {
    const png = await renderHeardleOg(dateOverride);
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  }

  const { chart, plan, dateKey } = await getToday(dateOverride);
  if (!chart.cover) {
    // No cover → return a tiny transparent placeholder rather than crashing.
    const blank = await sharp({
      create: {
        width: OG_SIZE,
        height: OG_SIZE,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();
    return new Response(new Uint8Array(blank), {
      headers: { "Content-Type": "image/png" },
    });
  }

  const hint = plan[0]!;
  const seed = `${dateKey}:0`;
  // Step 0 is always an image kind (every step0-eligible kind in HINT_META
  // is `isImage: true`), but fall back to pixelate if that ever changes.
  const transform = HINTS[hint.kind].transform ?? ((url, lv) => pixelate(url, lv));
  const buf = await transform(chart.cover, hint.level, seed);

  // Upscale to OG dimensions for crisp rendering on social previews.
  const upscaled = await sharp(buf)
    .resize(OG_SIZE, OG_SIZE, { kernel: "lanczos3" })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(upscaled), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

/**
 * Heardle social card — a square SVG with a single centered play badge
 * over the violet gradient. No text: sharp can't render fonts in Vercel
 * runtimes without an explicit font setup, and the brand context is
 * already carried by the page-level OG title/description anyway.
 */
async function renderHeardleOg(_dateOverride?: string): Promise<Buffer> {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OG_SIZE}" height="${OG_SIZE}" viewBox="0 0 ${OG_SIZE} ${OG_SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1625"/>
      <stop offset="100%" stop-color="#0d0a14"/>
    </linearGradient>
  </defs>
  <rect width="${OG_SIZE}" height="${OG_SIZE}" fill="url(#bg)"/>
  <g transform="translate(600, 600)">
    <circle r="220" fill="#a78bfa" opacity="0.95"/>
    <polygon points="-70,-100 120,0 -70,100" fill="#1a1625"/>
  </g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export const OG_DIMENSIONS = { width: OG_SIZE, height: OG_SIZE };
