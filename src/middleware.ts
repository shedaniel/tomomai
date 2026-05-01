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

  const response = NextResponse.next();

  // Mirror Vercel's edge-geo header into a client-readable cookie so client
  // code can route image requests to the regional CDN (e.g. cdn.cn.tomomai.lol
  // for users in China). Skipped locally where the header is absent.
  const country = request.headers.get('x-vercel-ip-country');
  if (country) {
    const existing = request.cookies.get('country')?.value;
    if (existing !== country) {
      response.cookies.set('country', country, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 1 day
        httpOnly: false,
      });
    }
  }

  return response;
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
