import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { get } from '@vercel/edge-config';
import { securityMiddleware } from './lib/security/middleware';

export async function middleware(request: NextRequest) {
  // Check maintenance mode (skip for the maintenance page itself and static assets)
  const { pathname } = request.nextUrl;
  if (pathname !== '/maintenance') {
    try {
      const maintenanceMode = await get<string>('maintenanceMode');
      if (maintenanceMode) {
        const url = request.nextUrl.clone();
        url.pathname = '/maintenance';
        return NextResponse.redirect(url, { status: 307 });
      }
    } catch {
      // Edge config unavailable, continue normally
    }
  }

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
