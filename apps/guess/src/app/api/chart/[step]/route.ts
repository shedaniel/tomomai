import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@tomomai/security/rate-limit";
import { readLimiter } from "@/lib/rate-limit";
import { buildReveal, describeHint, getToday } from "@/lib/today";
import { TOTAL_STEPS } from "@/lib/types";
import { readDateOverride } from "@/lib/route-date";

export const runtime = "nodejs";

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
  const { dateKey, chart, plan } = await getToday(override ?? undefined);

  // Step N (where N === TOTAL_STEPS - 1) is the reveal.
  if (step === TOTAL_STEPS - 1) {
    return NextResponse.json({
      step,
      dateKey,
      reveal: buildReveal(chart),
    });
  }

  const hint = plan[step]!;
  return NextResponse.json({
    step,
    dateKey,
    hint: { kind: hint.kind, level: hint.level, ...describeHint(hint, chart, dateKey) },
  });
}
