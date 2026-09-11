import { GET as updateAll } from "@/app/api/admin/update_all/route";
import type { Region } from "@tomomai/catalog/types";
import { NextRequest } from "next/server";
export async function runCronRegionUpdate(request: NextRequest, region: Region) {
  const url = new URL(request.url);
  url.searchParams.set("region", region);
  const token = region === "jp" ? process.env.MAIMAI_TOKEN_JP : region === "intl" ? process.env.MAIMAI_TOKEN_INTL : undefined;
  if (token) url.searchParams.set("token", token);
  return updateAll(new NextRequest(url, { headers: request.headers }));
}
