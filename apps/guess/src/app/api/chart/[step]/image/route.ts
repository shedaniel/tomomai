import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { readLimiter } from "@/lib/rate-limit";
import { getToday } from "@/lib/today";
import { TOTAL_STEPS } from "@/lib/types";
import { readDateOverride } from "@/lib/route-date";
import { HINTS } from "@/lib/hints-registry";

export const runtime = "nodejs";

async function renderImageForStep(
  step: number,
  dateOverride: string | undefined,
): Promise<{ buf: Buffer; dateKey: string } | null> {
  const { chart, plan, dateKey } = await getToday(dateOverride);
  if (!chart.cover) return null;
  if (step >= plan.length) return null;
  const hint = plan[step]!;
  const transform = HINTS[hint.kind].transform;
  if (!transform) return null;
  const seed = `${dateKey}:${step}`;
  const buf = await transform(chart.cover, hint.level, seed);
  return { buf, dateKey };
}

// Module-level LRU keyed by `${dateKey}:${step}`. Map preserves insertion
// order, so the oldest key is at the head; `get` reinserts to refresh recency.
const IMAGE_CACHE_MAX = 64;
const imageCache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | undefined {
  const buf = imageCache.get(key);
  if (buf === undefined) return undefined;
  imageCache.delete(key);
  imageCache.set(key, buf);
  return buf;
}

function cacheSet(key: string, buf: Buffer): void {
  if (imageCache.has(key)) imageCache.delete(key);
  imageCache.set(key, buf);
  if (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ step: string }> },
) {
  const limited = await rateLimit(req, readLimiter);
  if (limited) return limited;

  const { step: stepStr } = await context.params;
  const step = Number.parseInt(stepStr, 10);
  if (!Number.isInteger(step) || step < 0 || step >= TOTAL_STEPS) {
    return NextResponse.json({ error: "step out of range" }, { status: 400 });
  }

  const override = readDateOverride(req);
  if (override === "invalid") {
    return NextResponse.json({ error: "invalid date" }, { status: 404 });
  }

  const { dateKey } = await getToday(override ?? undefined);
  const key = `${dateKey}:${step}`;
  let buf = cacheGet(key);
  if (!buf) {
    const rendered = await renderImageForStep(step, override ?? undefined);
    if (!rendered) {
      return NextResponse.json({ error: "no image for this step" }, { status: 404 });
    }
    buf = rendered.buf;
    cacheSet(key, buf);
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
