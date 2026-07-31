import { NextRequest, NextResponse } from 'next/server';
import { apiLimiter, authLimiter, clientIp, songDetailLimiter } from './redis-rate-limit';
import { CORS_CONFIG } from './config';
import { logger } from '../logger';
import { locales } from '@tomomai/i18n/locale';

/**
 * Security middleware that combines multiple security features:
 * - Rate limiting
 * - Security headers
 * - CORS protection
 * - Request validation
 */
export async function securityMiddleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const response = NextResponse.next();

  // 1. Apply security headers
  applySecurityHeaders(response);

  // 2. Check rate limiting based on path
  const rateLimitResult = await checkRateLimiting(request, path);
  if (rateLimitResult.limited && rateLimitResult.response) {
    return rateLimitResult.response;
  }

  // 3. Apply CORS headers for API routes
  if (path.startsWith('/api/')) {
    applyCorsHeaders(response, request);
  }

  return response;
}

/**
 * Apply security headers to response
 */
function applySecurityHeaders(response: NextResponse): void {
  // Basic security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Prevent MIME sniffing
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Strict Transport Security
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
}

// Auth paths that involve credential submission or account state changes.
// Read-only session/key management routes (e.g. /api/auth/api-key/list,
// /api/auth/get-session) intentionally omitted — they use the general apiLimiter.
const STRICT_AUTH_PREFIXES = [
  '/api/auth/sign-in',
  '/api/auth/sign-up',
  '/api/auth/callback',
  '/api/auth/oauth',
  '/api/auth/passkey/authenticate',
  '/api/auth/reset-password',
  '/api/auth/change-password',
  '/api/auth/send-verification-email',
  '/api/auth/verify-email',
  '/api/auth/delete-user',
  '/api/login',
];

function isStrictAuthPath(path: string): boolean {
  return STRICT_AUTH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isSongDetailPath(path: string): boolean {
  const segments = path.split('/');
  return (segments.length === 5 || (segments.length === 6 && segments[5] === ''))
    && segments[0] === ''
    && (locales as readonly string[]).includes(segments[1]!)
    && segments[2] === 'db'
    && segments[3] === 'songs'
    && segments[4] !== '';
}

/**
 * Check rate limiting based on request path
 */
async function checkRateLimiting(request: NextRequest, path: string): Promise<{
  limited: boolean;
  response?: NextResponse;
}> {
  try {
    let limiter: typeof apiLimiter | null = null;
    let message = "Too many requests. Please try again later.";

    if (isSongDetailPath(path)) {
      limiter = songDetailLimiter;
      message = "Too many song detail requests. Please try again later.";
    } else if (isStrictAuthPath(path)) {
      limiter = authLimiter;
      message = "Too many authentication attempts. Please try again later.";
    } else if (path.startsWith('/api/')) {
      limiter = apiLimiter;
    }

    if (!limiter) return { limited: false };

    const result = await limiter.checkRequest(request);
    if (result.limited) {
      logger.warn({ ip: clientIp(request), path }, 'Rate limit exceeded');
      const response = NextResponse.json({ error: message }, { status: 429 });
      applyRateLimitHeaders(response, result.headers);
      return { limited: true, response };
    }
    return { limited: false };
  } catch (error) {
    // Fail-open on unexpected errors so we don't lock everyone out if Redis hiccups.
    logger.error({ err: error, context: 'rate-limiting' }, 'Error checking rate limits');
    return { limited: false };
  }
}

/**
 * Apply rate limit headers to response
 */
function applyRateLimitHeaders(response: NextResponse, headers?: Record<string, string>): void {
  if (headers) {
    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }
}

/**
 * Apply CORS headers for API routes
 */
function applyCorsHeaders(response: NextResponse, request: NextRequest): void {
  // Single source of truth — see CORS_CONFIG in ./config.ts (which also
  // merges $TRUSTED_ORIGINS for the cn/ proxy and any other extra hosts).
  const allowedOrigins = CORS_CONFIG.allowedOrigins;

  const origin = request.headers.get('origin');

  // Allow requests from our domains
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  // Allow common methods and headers
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
}

/**
 * Validate request content type for API routes
 */
export function validateContentType(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;

  // Skip validation for GET requests and options
  if (request.method === 'GET' || request.method === 'OPTIONS') {
    return null;
  }

  // Validate content type for API routes
  if (path.startsWith('/api/')) {
    const contentType = request.headers.get('content-type');
    const isFormData = contentType?.includes('multipart/form-data');
    const isJson = contentType?.includes('application/json');
    const isUrlEncoded = contentType?.includes('application/x-www-form-urlencoded');

    if (!isFormData && !isJson && !isUrlEncoded) {
      logger.warn(`Invalid content type for ${path}: ${contentType}`);
      return NextResponse.json(
        { error: 'Invalid Content-Type. Expected application/json, multipart/form-data, or application/x-www-form-urlencoded.' },
        { status: 415 }
      );
    }
  }

  return null;
}

/**
 * CSRF protection middleware
 */
export function csrfProtection(request: NextRequest): NextResponse | null {
  const path = request.nextUrl.pathname;

  // Skip CSRF protection for safe methods
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null;
  }

  // Skip for API routes that don't need CSRF protection
  const csrfExemptRoutes = [
    '/api/login',
    '/api/auth',
    '/api/discord',
    '/api/webhook'
  ];

  if (csrfExemptRoutes.some(route => path.startsWith(route))) {
    return null;
  }

  // For other state-changing requests, we would normally check CSRF token
  // This is a placeholder for actual CSRF implementation
  // const csrfToken = request.headers.get('x-csrf-token');
  // if (!csrfToken || !validateCsrfToken(csrfToken)) {
  //   return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  // }

  return null;
}
