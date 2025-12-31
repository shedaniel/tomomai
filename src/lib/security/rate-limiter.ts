import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter using Map (Vercel-compatible)
const rateLimitCache = new Map<string, { count: number, lastReset: number }>();

// Cleanup function to remove old entries
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of rateLimitCache.entries()) {
    // Remove entries older than 1 hour
    if (now - value.lastReset > 60 * 60 * 1000) {
      rateLimitCache.delete(key);
    }
  }
}

interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Max requests per window
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
  headers?: boolean; // Whether to add rate limit headers
}

export class MemoryRateLimiter {
  private windowMs: number;
  private maxRequests: number;
  private keyGenerator: (req: NextRequest) => string;
  private headers: boolean;

  constructor(options: RateLimitOptions = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // Default: 1 minute
    this.maxRequests = options.maxRequests || 100; // Default: 100 requests per window
    this.headers = options.headers !== false; // Default: true

    // Default key generator: use IP address
    this.keyGenerator = options.keyGenerator || ((req: NextRequest) => {
      const ip = req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        'unknown';
      return ip.split(',')[0].trim();
    });
  }

  /**
   * Check if request should be rate limited
   */
  async check(req: NextRequest): Promise<{
    limited: boolean;
    remaining: number;
    reset: number;
    headers?: Record<string, string>;
  }> {
    const key = this.keyGenerator(req);
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or initialize cache entry
    let entry = rateLimitCache.get(key);

    if (!entry || entry.lastReset < windowStart) {
      // First request in this window or window expired
      entry = { count: 1, lastReset: now };
      rateLimitCache.set(key, entry);
    } else {
      // Increment request count
      entry.count++;
      rateLimitCache.set(key, entry);
    }

    const remaining = Math.max(0, this.maxRequests - entry.count);
    const limited = entry.count > this.maxRequests;
    const reset = Math.ceil((entry.lastReset + this.windowMs - now) / 1000);

    // Prepare headers if enabled
    const headers: Record<string, string> = {};
    if (this.headers) {
      headers['X-RateLimit-Limit'] = this.maxRequests.toString();
      headers['X-RateLimit-Remaining'] = remaining.toString();
      headers['X-RateLimit-Reset'] = reset.toString();
    }

    return {
      limited,
      remaining,
      reset,
      headers: this.headers ? headers : undefined,
    };
  }

  /**
   * Middleware for Next.js route handlers
   */
  async middleware(req: NextRequest): Promise<NextResponse | null> {
    const result = await this.check(req);

    if (result.limited) {
      const response = NextResponse.json(
        { error: 'Too many requests, please try again later.' },
        { status: 429 }
      );

      // Add rate limit headers
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      }

      return response;
    }

    return null;
  }
}

// Singleton instance for general API rate limiting
export const apiRateLimiter = new MemoryRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
});

// Singleton instance for auth endpoints (more restrictive)
export const authRateLimiter = new MemoryRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 10, // 10 requests per 5 minutes
});

// Singleton instance for Discord commands
export const discordRateLimiter = new MemoryRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 commands per minute
  keyGenerator: (req: NextRequest) => {
    // For Discord, use user ID from headers if available
    const userId = req.headers.get('x-discord-user-id');
    if (userId) return `discord:${userId}`;

    // Fallback to IP
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    return `discord:${ip.split(',')[0].trim()}`;
  }
});
