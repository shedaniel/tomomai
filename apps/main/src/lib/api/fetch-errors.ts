import { logger } from "@/lib/logger";
import { fetchStartRejection } from "@/server/services/games/fetch-errors";

/** Answers a failed `startScoreFetch` for REST callers with the shared status tables. */
export function mapFetchStartError(error: unknown): Response {
  const rejection = fetchStartRejection(error);
  if (rejection) return Response.json({ error: rejection.message, code: rejection.code }, rejection.init);
  logger.error({ err: error }, "startFetch error");
  return Response.json({ error: "Failed to start fetch" }, { status: 500 });
}
