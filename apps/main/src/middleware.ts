import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCachedEdgeConfig } from './lib/edge-config-cache';
import { nanoid } from 'nanoid';
import { securityMiddleware } from './lib/security/middleware';
import { locales, type Locale } from './i18n/locale';

const FONT_CORS_ORIGINS = new Set([
  'https://maimaidx.jp',
  'https://maimaidx-eng.com',
]);

export async function middleware(request: NextRequest) {
  // Check maintenance mode (skip for the maintenance page itself and static assets)
  const { pathname } = request.nextUrl;

  // Per-request correlation id. Honor an upstream one if present (idempotent for
  // retries / tracing proxies), otherwise generate. Propagated to route handlers
  // via the x-request-id request header and echoed on every response so it can
  // be quoted in bug reports and matched against Axiom logs (docs/LOGGING.md).
  // The inbound header is client-controllable, so only accept safe token shapes
  // (nanoid alphabet, bounded length) to avoid log injection.
  const inboundId = request.headers.get('x-request-id');
  const requestId = inboundId && /^[A-Za-z0-9_-]{1,64}$/.test(inboundId) ? inboundId : nanoid(10);
  const stamp = (res: NextResponse) => {
    res.headers.set('x-request-id', requestId);
    return res;
  };

  if (pathname.startsWith('/res/fonts/')) {
    const origin = request.headers.get('origin');
    const response = NextResponse.next();
    if (origin && FONT_CORS_ORIGINS.has(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      response.headers.set('Vary', 'Origin');
    }
    return stamp(response);
  }
  if (pathname !== '/maintenance') {
    try {
      const maintenanceMode = await getCachedEdgeConfig<string>('maintenanceMode');
      if (maintenanceMode) {
        const url = request.nextUrl.clone();
        url.pathname = '/maintenance';
        return stamp(NextResponse.redirect(url, { status: 307 }));
      }
    } catch {
      // Edge config unavailable, continue normally
    }
  }

  // Apply security middleware to all requests
  const securityResponse = await securityMiddleware(request);

  // If security middleware returns a response (e.g., rate limited), return it
  if (securityResponse.status !== 200) {
    return stamp(securityResponse);
  }

  // Forward `?tl=<locale>` as a request header so page-level `getLocale()` can
  // honor it. Used to expose locale variants for SEO crawlers via hreflang
  // and as a "switch and stay" link for shared URLs (e.g. Google SERP → JP).
  const tl = request.nextUrl.searchParams.get('tl');
  const validTl = tl && locales.includes(tl as Locale) ? (tl as Locale) : null;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('x-request-id', requestId);
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

  return stamp(response);
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
