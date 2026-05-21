import sharp from "sharp";
import { pixelate } from "./image";
import { getToday } from "./today";
import { HINTS } from "./hints-registry";

const OG_SIZE = 1200;

/**
 * Render the OpenGraph cover image for a given (optional) past date. We just
 * reuse step 0 of the day's plan — the most-obfuscated cover hint — and
 * upscale it to OG dimensions. Returns a `Response` ready to return from a
 * Next.js `opengraph-image.tsx` default export.
 */
export async function renderOgImage(dateOverride?: string): Promise<Response> {
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

export const OG_DIMENSIONS = { width: OG_SIZE, height: OG_SIZE };
