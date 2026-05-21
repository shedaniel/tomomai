import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { get } from '@vercel/edge-config';
import { securityMiddleware } from './lib/security/middleware';
import { locales, type Locale } from './i18n/locale';

const FONT_CORS_ORIGINS = new Set([
  'https://maimaidx.jp',
  'https://maimaidx-eng.com',
]);

export async function middleware(request: NextRequest) {
  // Check maintenance mode (skip for the maintenance page itself and static assets)
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/res/fonts/')) {
    const origin = request.headers.get('origin');
    const response = NextResponse.next();
    if (origin && FONT_CORS_ORIGINS.has(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      response.headers.set('Vary', 'Origin');
    }
    return response;
  }
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

  // Forward `?tl=<locale>` as a request header so page-level `getLocale()` can
  // honor it. Used to expose locale variants for SEO crawlers via hreflang
  // and as a "switch and stay" link for shared URLs (e.g. Google SERP → JP).
  const tl = request.nextUrl.searchParams.get('tl');
  const validTl = tl && locales.includes(tl as Locale) ? (tl as Locale) : null;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  if (validTl) requestHeaders.set('x-tl-locale', validTl);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Persist `?tl=` as the user's locale so subsequent internal navigation
  // (which doesn't carry the query) stays in the chosen language.
  if (validTl && request.cookies.get('NEXT_LOCALE')?.value !== validTl) {
    response.cookies.set('NEXT_LOCALE', validTl, {
      path: '/',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year — matches the client-side setLocaleCookie
      httpOnly: false,
    });
  }

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

// Apply middleware to all routes except static files.
// Use Node runtime so ioredis (the Redis-backed rate limiter) can open TCP sockets.
export const config = {
  runtime: 'nodejs',
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
