import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimiter, authRateLimiter } from './rate-limiter';
import { logger } from '../logger';

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

  // Content Security Policy - adjust as needed for your application
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
  );

  // Prevent MIME sniffing
  response.headers.set('X-Download-Options', 'noopen');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Strict Transport Security
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
}

/**
 * Check rate limiting based on request path
 */
async function checkRateLimiting(request: NextRequest, path: string): Promise<{
  limited: boolean;
  response?: NextResponse;
}> {
  try {
    // Apply different rate limits based on path
    if (path.startsWith('/api/login') || path.startsWith('/api/auth')) {
      // Auth endpoints - more restrictive
      const result = await authRateLimiter.check(request);
      if (result.limited) {
        logger.warn({ key: authRateLimiter.keyGenerator(request) }, `Rate limit exceeded for auth endpoint: ${path}`);
        const response = NextResponse.json(
          { error: 'Too many authentication attempts. Please try again later.' },
          { status: 429 }
        );
        applyRateLimitHeaders(response, result.headers);
        return { limited: true, response };
      }
      applyRateLimitHeaders(NextResponse.next(), result.headers);
    } else if (path.startsWith('/api/')) {
      // General API endpoints
      const result = await apiRateLimiter.check(request);
      if (result.limited) {
        logger.warn({ key: apiRateLimiter.keyGenerator(request) }, `Rate limit exceeded for API endpoint: ${path}`);
        const response = NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 }
        );
        applyRateLimitHeaders(response, result.headers);
        return { limited: true, response };
      }
      applyRateLimitHeaders(NextResponse.next(), result.headers);
    }

    return { limited: false };
  } catch (error) {
    logger.error({ error, context: 'rate-limiting' }, 'Error checking rate limits');
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
  const allowedOrigins = [
    'https://maimai-charts.vercel.app',
    'https://localhost:3000',
    'http://localhost:3000',
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ];

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Allow requests from our domains
  if (origin && allowedOrigins.some(url => origin.startsWith(url))) {
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
