import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCachedEdgeConfig } from './lib/edge-config-cache';
import { nanoid } from 'nanoid';
import { securityMiddleware } from './lib/security/middleware';
import { locales, defaultLocale, type Locale } from './i18n/locale';

const FONT_CORS_ORIGINS = new Set([
  'https://maimaidx.jp',
  'https://maimaidx-eng.com',
]);

// Path prefixes that must NOT be locale-prefixed.
function isUnlocalizable(pathname: string): boolean {
  // Any path whose last segment has a file extension is a static asset or a
  // route handler (e.g. /icon.webp, /sitemap.xml, /openapi.json) and must
  // never be locale-redirected — doing so breaks next/image optimization
  // and asset fetches.
  const lastSegment = pathname.split('/').pop() || '';
  if (/[./][a-zA-Z0-9]+$/.test(lastSegment)) return true;
  return (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/cn-proxy/link') ||
    pathname.startsWith('/userscript') ||
    // Legal pages are locale-independent reference docs served at a fixed URL.
    pathname === '/tos' ||
    pathname === '/privacy'
  );
}

function isLocalized(pathname: string): boolean {
  const first = pathname.split('/')[1];
  return !!first && (locales as readonly string[]).includes(first);
}

/** Negotiate a locale from the NEXT_LOCALE cookie then Accept-Language. */
function negotiateLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get('NEXT_LOCALE')?.value as Locale | undefined;
  if (cookie && (locales as readonly string[]).includes(cookie)) return cookie;

  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    const parsed = acceptLanguage.split(',').map((l) => {
      const [tag, ...params] = l.split(';').map((s) => s.trim());
      const qParam = params.find((p) => p.startsWith('q='));
      const q = qParam ? parseFloat(qParam.slice(2)) : 1;
      return { tag: tag!, q: isNaN(q) ? 0 : q };
    });
    const langs = parsed
      .filter((e) => e.tag)
      .sort((a, b) => b.q - a.q)
      .map((e) => e.tag);
    for (const l of langs) {
      if ((locales as readonly string[]).includes(l)) return l as Locale;
    }
    for (const l of langs) {
      const short = l.split('-')[0];
      const match = locales.find((loc) => loc.startsWith(short));
      if (match) return match;
    }
  }
  return defaultLocale;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Per-request correlation id (see docs/LOGGING.md).
  const inboundId = request.headers.get('x-request-id');
  const requestId =
    inboundId && /^[A-Za-z0-9_-]{1,64}$/.test(inboundId) ? inboundId : nanoid(10);
  const stamp = (res: NextResponse) => {
    res.headers.set('x-request-id', requestId);
    return res;
  };

  // Font CORS handling.
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

  const isMaintenanceRoute =
    pathname === '/maintenance' ||
    /^\/[a-zA-Z-]+\/maintenance(?:\/.*)?$/.test(pathname);

  // Maintenance mode redirect to the localized maintenance page.
  if (!isMaintenanceRoute && !isUnlocalizable(pathname)) {
    try {
      const maintenanceMode = await getCachedEdgeConfig<string>('maintenanceMode');
      if (maintenanceMode) {
        const locale = negotiateLocale(request);
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}/maintenance`;
        url.search = '';
        return stamp(NextResponse.redirect(url, { status: 307 }));
      }
    } catch {
      // Edge config unavailable, continue normally
    }
  }

  // Locale routing: redirect bare paths to `/{locale}...`.
  if (!isLocalized(pathname) && !isUnlocalizable(pathname)) {
    const locale = negotiateLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
    const res = NextResponse.redirect(url, { status: 307 });
    // Persist the negotiated locale.
    if (request.cookies.get('NEXT_LOCALE')?.value !== locale) {
      res.cookies.set('NEXT_LOCALE', locale, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: false,
      });
    }
    return stamp(res);
  }

  // Apply security middleware to all requests that proceed.
  const securityResponse = await securityMiddleware(request);
  if (securityResponse.status !== 200) {
    return stamp(securityResponse);
  }

  // Forward pathname + request id to route handlers / pages.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // securityMiddleware set CSP/HSTS/CORS/etc. on its own NextResponse.next();
  // carry them onto the response we actually return so they aren't dropped.
  securityResponse.headers.forEach((value, key) => {
    response.headers.set(key, value);
  });

  // Mirror Vercel edge-geo into a client-readable cookie for CDN routing.
  const country = request.headers.get('x-vercel-ip-country');
  if (country) {
    const existing = request.cookies.get('country')?.value;
    if (existing !== country) {
      response.cookies.set('country', country, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        httpOnly: false,
      });
    }
  }

  return stamp(response);
}

// Use Node runtime so ioredis (the Redis-backed rate limiter) can open TCP sockets.
export const config = {
  runtime: 'nodejs',
  matcher: [
    /*
     * Match all request paths except static assets.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
