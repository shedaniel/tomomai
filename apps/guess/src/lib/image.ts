import sharp from "sharp";
import { AGENT } from "./http-agent";
import { Rng } from "./rng";

const TARGET = 512; // output edge in px — cover art is square

// Pixelate: NxN mosaic grid per level.
const PIXELATE_GRID: Record<number, number> = { 0: 4, 1: 12, 2: 32 };
// Blinds: stripe count + vertical color bands per level.
const BLINDS_STRIPES: Record<number, number> = { 0: 48, 1: 128, 2: 256 };
const BLINDS_BANDS: Record<number, number> = { 0: 4, 1: 8, 2: 12 };
// Crop: random window sized as a fraction of the image, expanded back to full size.
const CROP_FRAC: Record<number, number> = { 0: 0.2, 1: 0.45, 2: 0.78 };
// Posterize: number of quantisation steps per RGB channel, plus a
// Gaussian blur sigma applied AFTER quantisation. The blur smears the
// hard quantisation boundaries so individual colour cells aren't easy to
// read off.
//   L0 = 2 levels per channel (8 colours) + heavy blur
//   L1 = 3 levels per channel (27 colours) + lighter blur
const POSTERIZE_LEVELS: Record<number, number> = { 0: 2, 1: 3 };
const POSTERIZE_BLUR: Record<number, number> = { 0: 16, 1: 8 };

// Edge-detect: Sobel magnitude threshold per level. L0 is stricter so only
// the strongest edges survive; L1 admits weaker edges so the outline is
// closer to a line-art rendering of the cover.
const EDGE_THRESHOLD: Record<number, number> = { 0: 70, 1: 28 };

// Shuffle-move: Manhattan-distance cap per level (on a 128×128 tile grid).
const SHUFFLE_GRID = 128;
// Per-level max Manhattan displacement (number of tile-steps). L0 is set to
// the grid dimension so tiles can effectively reach anywhere → total chaos.
const SHUFFLE_MAX_DIST: Record<number, number> = { 0: 100, 1: 30, 2: 12 };

async function fetchCover(url: string): Promise<Buffer> {
  // maimaidx.jp serves cover art behind a cert chain Node won't validate by
  // default — use the permissive undici dispatcher (see ./http-agent.ts).
  const res = await fetch(url, {
    ...({ dispatcher: AGENT } as RequestInit),
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Cover fetch failed: ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ---------- Pixelate -----------------------------------------------------

export async function pixelate(coverUrl: string, level: number): Promise<Buffer> {
  const grid = PIXELATE_GRID[level] ?? PIXELATE_GRID[0]!;
  const src = await fetchCover(coverUrl);
  const small = await sharp(src)
    .resize(grid, grid, { fit: "cover", kernel: "lanczos3" })
    .toBuffer();
  return sharp(small)
    .resize(TARGET, TARGET, { kernel: "nearest" })
    .webp({ quality: 80 })
    .toBuffer();
}

// ---------- Blinds (vertical) -------------------------------------------

export async function blinds(coverUrl: string, level: number): Promise<Buffer> {
  const stripes = BLINDS_STRIPES[level] ?? BLINDS_STRIPES[0]!;
  const bands = BLINDS_BANDS[level] ?? BLINDS_BANDS[0]!;
  const src = await fetchCover(coverUrl);
  const slim = await sharp(src)
    .resize(stripes, bands, { fit: "fill", kernel: "lanczos3" })
    .toBuffer();
  return sharp(slim)
    .resize(TARGET, TARGET, { fit: "fill", kernel: "nearest" })
    .webp({ quality: 90 })
    .toBuffer();
}

// ---------- Blinds (horizontal) -----------------------------------------

/**
 * Same construction as `blinds`, but rows replace columns: each horizontal
 * stripe is `bands` wide of averaged-color cells.
 */
export async function blindsHorizontal(
  coverUrl: string,
  level: number,
): Promise<Buffer> {
  const stripes = BLINDS_STRIPES[level] ?? BLINDS_STRIPES[0]!;
  const bands = BLINDS_BANDS[level] ?? BLINDS_BANDS[0]!;
  const src = await fetchCover(coverUrl);
  const slim = await sharp(src)
    .resize(bands, stripes, { fit: "fill", kernel: "lanczos3" })
    .toBuffer();
  return sharp(slim)
    .resize(TARGET, TARGET, { fit: "fill", kernel: "nearest" })
    .webp({ quality: 90 })
    .toBuffer();
}

// ---------- Crop ---------------------------------------------------------

/**
 * Random-position crop of the cover: a `frac × frac` window is cut from
 * somewhere on the image, then upscaled back to TARGET×TARGET. The window
 * position is deterministic on (seedLabel, level).
 *   level 0 → 20% window (hardest)
 *   level 1 → 45% window
 *   level 2 → 78% window (easiest)
 */
export async function crop(
  coverUrl: string,
  level: number,
  seedLabel: string,
): Promise<Buffer> {
  const frac = CROP_FRAC[level] ?? CROP_FRAC[0]!;
  const src = await fetchCover(coverUrl);
  const norm = await sharp(src)
    .resize(TARGET, TARGET, { fit: "cover" })
    .toBuffer();
  const winPx = Math.max(1, Math.floor(TARGET * frac));
  const maxOffset = TARGET - winPx;
  const rng = new Rng(`${seedLabel}:crop:${level}`);
  const left = maxOffset > 0 ? rng.intBelow(maxOffset + 1) : 0;
  const top = maxOffset > 0 ? rng.intBelow(maxOffset + 1) : 0;
  const window = await sharp(norm)
    .extract({ left, top, width: winPx, height: winPx })
    .toBuffer();
  // Upscale with lanczos so the result looks like a zoom, not pixel art.
  return sharp(window)
    .resize(TARGET, TARGET, { kernel: "lanczos3" })
    .webp({ quality: 85 })
    .toBuffer();
}

// ---------- Posterize ----------------------------------------------------

/**
 * Quantises the cover's RGB channels into `n` discrete steps each (so only
 * `n³` colours), then smears the result with a Gaussian blur. The blur is
 * what really kills recognisability — the harsh posterised colour blocks
 * by themselves still trace the cover's composition; blurring them turns
 * the image into vague colour fields.
 */
export async function posterize(coverUrl: string, level: number): Promise<Buffer> {
  const n = POSTERIZE_LEVELS[level] ?? POSTERIZE_LEVELS[0]!;
  const sigma = POSTERIZE_BLUR[level] ?? POSTERIZE_BLUR[0]!;
  const src = await fetchCover(coverUrl);
  const { data, info } = await sharp(src)
    .resize(TARGET, TARGET, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Each channel maps to one of `n` bucket centres in [0, 255].
  const step = 255 / (n - 1);
  const quantised = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    const bucket = Math.round(data[i]! / step);
    quantised[i] = Math.round(bucket * step);
  }
  return sharp(quantised, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .blur(sigma)
    .webp({ quality: 90 })
    .toBuffer();
}

// ---------- Edge-detect --------------------------------------------------

/**
 * Sobel edge detection over a grayscale version of the cover, thresholded so
 * the result is pure black/white. The cover's shapes are reduced to line art
 * — the player has to recognise the cover by its silhouette and contours.
 */
export async function edgeDetect(coverUrl: string, level: number): Promise<Buffer> {
  const threshold = EDGE_THRESHOLD[level] ?? EDGE_THRESHOLD[0]!;
  const src = await fetchCover(coverUrl);

  // Single-channel grayscale raw at TARGET resolution.
  const grayBuf = await sharp(src)
    .resize(TARGET, TARGET, { fit: "cover" })
    .greyscale()
    .extractChannel(0)
    .raw()
    .toBuffer();
  const w = TARGET;
  const h = TARGET;

  // Sobel convolution: Gx and Gy at each interior pixel, magnitude = √(Gx²+Gy²).
  const out = Buffer.alloc(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = grayBuf[(y - 1) * w + (x - 1)]!;
      const tc = grayBuf[(y - 1) * w + x]!;
      const tr = grayBuf[(y - 1) * w + (x + 1)]!;
      const ml = grayBuf[y * w + (x - 1)]!;
      const mr = grayBuf[y * w + (x + 1)]!;
      const bl = grayBuf[(y + 1) * w + (x - 1)]!;
      const bc = grayBuf[(y + 1) * w + x]!;
      const br = grayBuf[(y + 1) * w + (x + 1)]!;
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      out[y * w + x] = mag > threshold ? 255 : 0;
    }
  }

  return sharp(out, { raw: { width: w, height: h, channels: 1 } })
    .webp({ quality: 80 })
    .toBuffer();
}

// ---------- Shuffle-move -------------------------------------------------

/**
 * Splits the cover into a SHUFFLE_GRID × SHUFFLE_GRID lattice of tiles and
 * permutes them, bounding every tile's Manhattan displacement from its
 * original position by `maxDist`.
 *
 * Algorithm:
 *   1. Visit every slot once, in *center-outward* BFS order. Centre tiles
 *      get first pick of swap partners — this tends to scatter the most
 *      visually informative region first, leaving the periphery to settle
 *      into whatever's left.
 *   2. For each visited slot, try up to `maxDist` random swap partners. A
 *      partner is drawn as a (dx, dy) offset uniformly inside the diamond
 *      |dx| + |dy| ≤ maxDist (reject-sample from the bounding square).
 *      Accept the swap only when both endpoints stay within `maxDist`
 *      Manhattan of their respective origins after the swap.
 *
 * Single pass, no refine phase needed — the per-slot retry budget plus
 * the centre-first order together fill the allowed displacement region
 * far better than uniform random swaps would.
 */
export async function shuffleMove(
  coverUrl: string,
  level: number,
  seedLabel: string,
): Promise<Buffer> {
  const maxDist = SHUFFLE_MAX_DIST[level] ?? SHUFFLE_MAX_DIST[0]!;
  const grid = SHUFFLE_GRID;

  const src = await fetchCover(coverUrl);
  const { data: srcRaw, info } = await sharp(src)
    .resize(TARGET, TARGET, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = info.width;
  const channels = info.channels;
  const tilePx = Math.floor(width / grid); // 512/128 = 4
  const usableW = tilePx * grid;
  const usableH = tilePx * grid;

  const N = grid * grid;
  // `perm[slot]` = id of the source tile currently parked at `slot`.
  const perm = new Int32Array(N);
  for (let i = 0; i < N; i++) perm[i] = i;

  // Build center-outward visit order via 4-connected BFS from the grid centre.
  const visitOrder = (() => {
    const out = new Int32Array(N);
    const seen = new Uint8Array(N);
    const cx = grid >> 1;
    const cy = grid >> 1;
    const start = cy * grid + cx;
    const queue = new Int32Array(N);
    let head = 0;
    let tail = 0;
    let written = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const s = queue[head++];
      out[written++] = s;
      const sx = s % grid;
      const sy = (s / grid) | 0;
      const nbrs = [
        [sx + 1, sy],
        [sx - 1, sy],
        [sx, sy + 1],
        [sx, sy - 1],
      ];
      for (const [nx, ny] of nbrs) {
        if (nx < 0 || nx >= grid || ny < 0 || ny >= grid) continue;
        const n = ny * grid + nx;
        if (seen[n]) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    return out;
  })();

  const rng = new Rng(`${seedLabel}:shuffle:${level}`);

  for (let k = 0; k < visitOrder.length; k++) {
    const s = visitOrder[k]!;
    const sx = s % grid;
    const sy = (s / grid) | 0;

    for (let attempt = 0; attempt < maxDist; attempt++) {
      // Uniform sample in the diamond |dx|+|dy| ≤ maxDist via rejection
      // from the bounding square. Acceptance rate ≈ 50%.
      const dx = rng.intBelow(2 * maxDist + 1) - maxDist;
      const dy = rng.intBelow(2 * maxDist + 1) - maxDist;
      if (Math.abs(dx) + Math.abs(dy) > maxDist) continue;

      const cx = sx + dx;
      const cy = sy + dy;
      if (cx < 0 || cx >= grid || cy < 0 || cy >= grid) continue;
      const c = cy * grid + cx;
      if (c === s) continue;

      // Tile currently at slot s would move to slot c; tile at slot c would
      // move to slot s. Both must stay within `maxDist` Manhattan of their
      // origin (= their tile id).
      const tileS = perm[s]!;
      const tileC = perm[c]!;
      const sOrigX = tileS % grid;
      const sOrigY = (tileS / grid) | 0;
      const cOrigX = tileC % grid;
      const cOrigY = (tileC / grid) | 0;
      const tileSNewDisp = Math.abs(cx - sOrigX) + Math.abs(cy - sOrigY);
      if (tileSNewDisp > maxDist) continue;
      const tileCNewDisp = Math.abs(sx - cOrigX) + Math.abs(sy - cOrigY);
      if (tileCNewDisp > maxDist) continue;

      perm[s] = tileC;
      perm[c] = tileS;
      break;
    }
  }

  const dstRaw = Buffer.alloc(usableW * usableH * channels);
  for (let i = 0; i < perm.length; i++) {
    const srcTile = perm[i]!;
    const sx = (srcTile % grid) * tilePx;
    const sy = ((srcTile / grid) | 0) * tilePx;
    const dx = (i % grid) * tilePx;
    const dy = ((i / grid) | 0) * tilePx;
    for (let row = 0; row < tilePx; row++) {
      const sOff = ((sy + row) * width + sx) * channels;
      const dOff = ((dy + row) * usableW + dx) * channels;
      srcRaw.copy(dstRaw, dOff, sOff, sOff + tilePx * channels);
    }
  }

  return sharp(dstRaw, {
    raw: { width: usableW, height: usableH, channels },
  })
    .webp({ quality: 85 })
    .toBuffer();
}
