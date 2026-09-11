import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
export function middleware(request: NextRequest) {
  const inbound = request.headers.get("x-request-id");
  const requestId = inbound && /^[A-Za-z0-9_-]{1,64}$/.test(inbound) ? inbound : nanoid(10);
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}
export const config = { matcher: ["/api/:path*"] };
