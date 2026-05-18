import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

const BUNDLE_PATH = path.join(
  process.cwd(),
  "packages/userscript/dist/@tomomai/userscript.user.js"
);

export async function GET() {
  try {
    const content = fs.readFileSync(BUNDLE_PATH, "utf-8");
    return new NextResponse(content, {
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
