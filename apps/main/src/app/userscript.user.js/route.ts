import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveBaseUrlFromHeaders } from "@/lib/base-url";
import { useUserscriptFetch } from "@/lib/flags";
import { getCurrentGame } from "@/lib/games/current";

// The server runs from apps/main, like outputFileTracingRoot in next.config.ts assumes.
const BUNDLE_PATH = path.join(process.cwd(), "../../packages/userscript/dist/@tomomai/userscript.user.js");

const PLACEHOLDER = "__TOMOMAI_API_BASE__";
const CLIENT_ID_PLACEHOLDER = "__TOMOMAI_USERSCRIPT_CLIENT_ID__";
const HOST_PLACEHOLDER = "__TOMOMAI_API_HOST__";
const MATCH_PLACEHOLDER = "__TOMOMAI_SITE_MATCH__";
const GAME_PLACEHOLDER = "__TOMOMAI_GAME__";
const ICON_PLACEHOLDER = "__TOMOMAI_ICON__";

export async function GET(request: NextRequest) {
  if (!(await useUserscriptFetch())) return new NextResponse("Not Found", { status: 404 });
  const clientId = process.env.USERSCRIPT_CLIENT_ID;
  if (!clientId) {
    return new NextResponse(
      "USERSCRIPT_CLIENT_ID is not set on the server. Set it in the environment so the userscript can authenticate.",
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }

  try {
    const content = fs.readFileSync(BUNDLE_PATH, "utf-8");
    const base = resolveBaseUrlFromHeaders(request.headers);
    const { protocol, hostname } = new URL(base);
    const { id: game, brand } = getCurrentGame();
    const patched = content
      .replaceAll(PLACEHOLDER, base)
      .replaceAll(CLIENT_ID_PLACEHOLDER, clientId)
      .replaceAll(HOST_PLACEHOLDER, hostname)
      // Match patterns take no port, and one without a port matches every port.
      .replaceAll(MATCH_PLACEHOLDER, `${protocol}//${hostname}/*`)
      // The script serves both games, and opens on this site's game when the dialog does not name one.
      .replaceAll(GAME_PLACEHOLDER, game)
      .replaceAll(ICON_PLACEHOLDER, `${base}${brand.icon}`);
    return new NextResponse(patched, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch {
    return new NextResponse("Userscript bundle not found. Run: pnpm --filter @tomomai/userscript build", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
