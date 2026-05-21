import { NextResponse } from "next/server";
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

// Module-level cache keyed by `${dateKey}:${step}`. Old dateKey entries
// remain harmless — the keyspace grows by one entry per (date, step).
const imageCache = new Map<string, Buffer>();

export async function GET(
  req: Request,
  context: { params: Promise<{ step: string }> },
) {
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
  let buf = imageCache.get(key);
  if (!buf) {
    const rendered = await renderImageForStep(step, override ?? undefined);
    if (!rendered) {
      return NextResponse.json({ error: "no image for this step" }, { status: 404 });
    }
    buf = rendered.buf;
    imageCache.set(key, buf);
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
