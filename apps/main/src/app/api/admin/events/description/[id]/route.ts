import { NextRequest, NextResponse } from "next/server";
import { getPending } from "@/server/services/admin/pending-confirmation";
import type { EventsPendingPayload } from "@/server/services/admin/event-diff";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const pending = await getPending<EventsPendingPayload>(id);
  if (!pending) {
    return NextResponse.json(
      { error: "Not found or expired" },
      { status: 404 },
    );
  }
  if (pending.type !== "events") {
    return NextResponse.json(
      { error: "Invalid type" },
      { status: 400 },
    );
  }

  return new NextResponse(pending.data.description, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
