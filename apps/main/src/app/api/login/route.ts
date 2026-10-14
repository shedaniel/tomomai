import { decodeLoginAuthorization, verifyUserOtp } from "@/lib/otp";
import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";
import { formatSegaCookie } from "@/lib/games/token-format";
import { startScoreFetch } from "@/server/services/games/fetch-sessions";
import { fetchStartRejection } from "@/server/services/games/fetch-errors";
import { NextRequest, NextResponse } from "next/server";
import { flushLogger } from "@/lib/logger";
import { requestLogger } from "@/lib/request-logger";
import { securityMiddleware, validateContentType } from "@/lib/security/middleware";

export const dynamic = "force-dynamic";

function withCors(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", SEGA_AIME_GATEWAY.origin);
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

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  return withCors(response);
}

export async function POST(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "login");
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
    const user = formData.get("user");
    const otp = formData.get("otp");
    const token = formData.get("token");

    if (typeof user !== "string" || typeof otp !== "string" || typeof token !== "string") {
      return jsonResponse({ success: false, error: "Missing required form fields." }, { status: 400 });
    }

    const authorization = decodeLoginAuthorization(user);
    if (!authorization) {
      return jsonResponse({ success: false, error: "Invalid user identifier." }, { status: 401 });
    }
    const { userId, game, region } = authorization;

    if (!verifyUserOtp(userId, otp)) {
      return jsonResponse({ success: false, error: "Invalid or expired OTP." }, { status: 401 });
    }

    const result = await startScoreFetch({ userId, game, region, token: formatSegaCookie(token) });

    return jsonResponse({ success: true, sessionId: result.sessionId, status: result.status });
  } catch (error) {
    const rejection = fetchStartRejection(error);
    if (rejection) log.warn({ err: error }, "Login fetch refused");
    else log.error({ err: error }, "Login error");
    // Flush only on the error path — login is user-facing and low-volume.
    await flushLogger();

    if (rejection) {
      return jsonResponse({ success: false, error: rejection.message, code: rejection.code, requestId }, rejection.init);
    }
    return jsonResponse({ success: false, error: "Unexpected error.", requestId }, { status: 500 });
  }
}
