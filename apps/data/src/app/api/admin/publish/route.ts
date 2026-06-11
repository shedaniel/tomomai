import { publishCatalog } from "@/server/catalog/publish";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Missing authorization token" },
      { status: 401 }
    );
  }

  const adminToken = process.env.ADMIN_UPDATE_TOKEN;
  if (!adminToken) {
    console.error("ADMIN_UPDATE_TOKEN environment variable not set");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  if (token !== adminToken) {
    console.warn("Invalid admin token attempt");
    return NextResponse.json(
      { error: "Invalid authorization token" },
      { status: 403 }
    );
  }

  try {
    const manifest = await publishCatalog();
    return NextResponse.json({ success: true, manifest });
  } catch (error) {
    console.error("Error in admin publish route:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
}
