import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { securityMiddleware } from './lib/security/middleware';

export async function middleware(request: NextRequest) {
  // Apply security middleware to all requests
  const securityResponse = await securityMiddleware(request);

  // If security middleware returns a response (e.g., rate limited), return it
  if (securityResponse.status !== 200) {
    return securityResponse;
  }

  return NextResponse.next();
}

// Apply middleware to all routes except static files and API routes that need special handling
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth routes have special handling)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
