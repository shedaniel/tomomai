import { NextResponse } from "next/server";
import { getToday, TOTAL_STEPS } from "@/lib/today";
import { readDateOverride } from "@/lib/route-date";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const override = readDateOverride(req);
  if (override === "invalid") {
    return NextResponse.json({ error: "invalid date" }, { status: 404 });
  }
  const { dateKey } = await getToday(override ?? undefined);
  return NextResponse.json({ dateKey, totalSteps: TOTAL_STEPS });
}
