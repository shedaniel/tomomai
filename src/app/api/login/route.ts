import { decodeOpaqueUserId, verifyUserOtp } from "@/lib/otp";
import { startFetchServer, Region } from "@/lib/maimai-server-actions";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { securityMiddleware, validateContentType, csrfProtection } from "@/lib/security/middleware";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN = "https://lng-tgk-aime-gw.am-all.net";
const DEFAULT_REGION: Region = "intl";

function withCors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Private-Network", "true");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  return withCors(res);
}

function normalizeRegion(value: FormDataEntryValue | null): Region {
  if (typeof value !== "string") {
    return DEFAULT_REGION;
  }
  return value === "jp" ? "jp" : DEFAULT_REGION;
}

function normalizeToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  if (trimmed.startsWith("cookie://")) {
    return trimmed;
  }
  return `cookie://${trimmed}`;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  return withCors(response);
}

export async function POST(request: NextRequest) {
  // Apply security middleware
  const securityResponse = await securityMiddleware(request);
  if (securityResponse.status !== 200) {
    return securityResponse;
  }

  // Validate content type
  const contentTypeResponse = validateContentType(request);
  if (contentTypeResponse) {
    return contentTypeResponse;
  }

  try {
    const formData = await request.formData();
    const opaqueUserId = formData.get("user");
    const otp = formData.get("otp");
    const token = formData.get("token");
    const regionValue = formData.get("region");

    if (typeof opaqueUserId !== "string" || typeof otp !== "string" || typeof token !== "string") {
      return jsonResponse({ success: false, error: "Missing required form fields." }, { status: 400 });
    }

    const userId = decodeOpaqueUserId(opaqueUserId);
    if (!userId) {
      return jsonResponse({ success: false, error: "Invalid user identifier." }, { status: 401 });
    }

    if (!verifyUserOtp(userId, otp)) {
      return jsonResponse({ success: false, error: "Invalid or expired OTP." }, { status: 401 });
    }

    const region = normalizeRegion(regionValue);
    const finalToken = normalizeToken(token);

    const result = await startFetchServer(userId, region, finalToken);

    return jsonResponse({ success: true, sessionId: result.sessionId, status: result.status });
  } catch (error) {
    logger.error({ error, context: "/api/login" }, "Login error");

    if (error instanceof Error) {
      if (error.message.includes("already in progress")) {
        return jsonResponse({ success: false, error: error.message }, { status: 409 });
      }
      if (error.message.includes("Rate limited")) {
        return jsonResponse({ success: false, error: error.message }, { status: 429 });
      }
      if (error.message.includes("No user token found")) {
        return jsonResponse({ success: false, error: error.message }, { status: 400 });
      }
    }

    return jsonResponse({ success: false, error: "Unexpected error." }, { status: 500 });
  }
}
