import { type NextRequest } from "next/server";
import { withApiKey } from "@/lib/api/protect";
import { parseQuery } from "@/lib/api/parse-query";
import { watchFetchStatusServer } from "@/lib/maimai-server-actions";
import { Region } from "@/lib/types";
import { spec } from "./spec";

// SSE streams hold the connection open while the fetch runs (worker times out
// at 2 minutes), so allow the function to live a little longer than that.
export const dynamic = "force-dynamic";
export const maxDuration = 130;

export const GET = withApiKey(["fetch:read"], async (req: NextRequest, key) => {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  const { region, sessionId } = parsed;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        for await (const status of watchFetchStatusServer(key.userId, region as Region, {
          sessionId,
          signal: req.signal,
        })) {
          send("status", {
            id: status.id,
            status: status.status,
            startedAt: status.startedAt.toISOString(),
            completedAt: status.completedAt ? status.completedAt.toISOString() : null,
            errorMessage: status.errorMessage,
            statusStates: status.statusStates,
            notFoundScores: status.notFoundScores,
          });
        }
        send("done", { ok: true });
      } catch (err) {
        send("error", {
          error: err instanceof Error ? err.message : "stream error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
});
