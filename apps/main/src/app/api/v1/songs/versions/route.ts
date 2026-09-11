import type { NextRequest } from "next/server";
import { getAvailableVersions, getCurrentVersion } from "@/lib/metadata";
import { parseQuery } from "@/lib/api/parse-query";
import { zodJson } from "@/lib/api/zod-response";
import { SONG_CATALOG_CACHE_HEADERS } from "../cache-headers";
import { spec } from "./spec";

export function GET(req: NextRequest) {
  const parsed = parseQuery(req.nextUrl.searchParams, spec.query!);
  if (parsed instanceof Response) return parsed;
  return zodJson(spec.response, {
    currentVersion: getCurrentVersion(parsed.region),
    versions: getAvailableVersions(parsed.region).map(({ id, name }) => ({ id, name })),
  }, { headers: SONG_CATALOG_CACHE_HEADERS });
}
