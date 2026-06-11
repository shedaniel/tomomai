import { Region } from "@tomomai/catalog/types";
import { isRegionEnabled, getEnabledRegions } from "@tomomai/catalog/enabled-regions";
import { updateRegion } from "@/server/services/admin/update-pipeline";
import { publishCatalog } from "@/server/catalog/publish";
import { NextRequest, NextResponse } from "next/server";

// Handler for the /api/cron/update?region= route. Guarded by CRON_SECRET
// (Bearer check, dev bypass) exactly like apps/main's cron routes; jp/intl
// read their maimai session token from MAIMAI_TOKEN_JP / MAIMAI_TOKEN_INTL,
// cn needs no token. On success the updated catalog is published.

const TOKEN_ENV_BY_REGION: Partial<Record<Region, string>> = {
  jp: "MAIMAI_TOKEN_JP",
  intl: "MAIMAI_TOKEN_INTL",
};

export async function runCronRegionUpdate(req: NextRequest, region: Region): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV === "development";

  if (!cronSecret) {
    if (!isDev) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminToken = process.env.ADMIN_UPDATE_TOKEN;
  if (!adminToken) {
    console.error("ADMIN_UPDATE_TOKEN environment variable not set");
    return NextResponse.json({ error: "ADMIN_UPDATE_TOKEN is not configured" }, { status: 500 });
  }

  if (!isRegionEnabled(region)) {
    return NextResponse.json(
      { error: `Region '${region}' is not enabled. Enabled regions: ${getEnabledRegions().join(", ")}` },
      { status: 400 },
    );
  }

  let maimaiToken: string | null = null;
  const tokenEnv = TOKEN_ENV_BY_REGION[region];
  if (tokenEnv) {
    maimaiToken = process.env[tokenEnv] ?? null;
    if (!maimaiToken) {
      console.error(`${tokenEnv} environment variable not set`);
      return NextResponse.json(
        { error: `${tokenEnv} is not set — a maimai session token is required to update ${region}` },
        { status: 500 },
      );
    }
  }

  try {
    console.log(`Cron update requested for ${region.toUpperCase()}`);
    const origin = req.nextUrl.origin;
    const result = await updateRegion(origin, region, maimaiToken, adminToken, true);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
    }

    console.log("Publishing catalog artifact...");
    const manifest = await publishCatalog();
    console.log(`Catalog published: sequence ${manifest.sequence}`);

    return NextResponse.json({
      success: true,
      region,
      manifest,
      result: result.data,
    });
  } catch (error) {
    console.error(`Error in cron update-${region} route:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
