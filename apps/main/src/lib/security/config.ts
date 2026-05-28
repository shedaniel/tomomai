/**
 * Security configuration for the application
 * This file contains all security-related constants and settings
 */

// Rate limiting configuration
export const RATE_LIMIT_CONFIG = {
  // General API rate limits
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per window
  },

  // Authentication endpoints rate limits (more restrictive)
  auth: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10, // 10 requests per window
  },

  // Discord command rate limits
  discord: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 commands per minute
  },

  // Admin endpoints rate limits (very restrictive)
  admin: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // 5 requests per minute
  },
};

// Extra origins from env (comma-separated) — same var Better Auth reads
// (see src/lib/auth.ts). Lets us add cn.tomomai.lol etc. without code edits
// when generalising the cn/ proxy to other deployments.
const trustedFromEnv = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// CORS configuration
export const CORS_CONFIG = {
  allowedOrigins: [
    'https://maimai-charts.vercel.app',
    'https://localhost:3000',
    'http://localhost:3000',
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'https://lng-tgk-aime-gw.am-all.net', // Maimai official site for login
    ...trustedFromEnv,
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Discord-User-ID',
    'X-CSRF-Token',
  ],
  maxAge: 86400, // 24 hours
};

// Security headers configuration
export const SECURITY_HEADERS = {
  // Content Security Policy - adjust based on your application's needs
  csp: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",

  // Other security headers
  xssProtection: "1; mode=block",
  contentTypeOptions: "nosniff",
  frameOptions: "DENY",
  referrerPolicy: "strict-origin-when-cross-origin",
  hsts: "max-age=31536000; includeSubDomains; preload",
};

// CSRF configuration
export const CSRF_CONFIG = {
  enabled: true,
  cookieName: 'csrfToken',
  headerName: 'X-CSRF-Token',
  tokenLength: 32,
  tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
};

// Password policy configuration
export const PASSWORD_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxLength: 128,
};

// Session configuration
export const SESSION_CONFIG = {
  cookieName: 'session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  },
};

// Security feature flags
export const SECURITY_FEATURES = {
  rateLimiting: true,
  securityHeaders: true,
  corsProtection: true,
  csrfProtection: false, // Currently disabled, needs implementation
  contentTypeValidation: true,
  ipBlocking: false, // Currently disabled
  bruteForceProtection: true,
};

// Allowed file upload configuration
export const FILE_UPLOAD_CONFIG = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
};
