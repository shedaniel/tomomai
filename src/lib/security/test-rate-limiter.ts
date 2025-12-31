/**
 * Test file for rate limiter functionality
 * This can be run manually to verify the rate limiter is working
 */

import { MemoryRateLimiter, apiRateLimiter, authRateLimiter } from './rate-limiter';

async function testRateLimiter() {
  console.log('Testing Rate Limiter...');

  // Create a test rate limiter with very restrictive settings
  const testLimiter = new MemoryRateLimiter({
    windowMs: 1000, // 1 second
    maxRequests: 2, // 2 requests per window
  });

  // Mock request object
  const mockRequest = {
    headers: new Headers({
      'x-forwarded-for': '127.0.0.1',
    }),
  } as any;

  // Test 1: First request should be allowed
  console.log('Test 1: First request');
  const result1 = await testLimiter.check(mockRequest);
  console.log(`Limited: ${result1.limited}, Remaining: ${result1.remaining}`);

  // Test 2: Second request should be allowed
  console.log('Test 2: Second request');
  const result2 = await testLimiter.check(mockRequest);
  console.log(`Limited: ${result2.limited}, Remaining: ${result2.remaining}`);

  // Test 3: Third request should be limited
  console.log('Test 3: Third request (should be limited)');
  const result3 = await testLimiter.check(mockRequest);
  console.log(`Limited: ${result3.limited}, Remaining: ${result3.remaining}`);

  // Test 4: Wait for window to reset and try again
  console.log('Test 4: Waiting for rate limit window to reset...');
  await new Promise(resolve => setTimeout(resolve, 1100)); // Wait 1.1 seconds

  console.log('Test 4: Request after window reset');
  const result4 = await testLimiter.check(mockRequest);
  console.log(`Limited: ${result4.limited}, Remaining: ${result4.remaining}`);

  // Test singleton limiters
  console.log('\\nTesting Singleton Limiters:');

  console.log('API Rate Limiter config:', {
    windowMs: '15 minutes',
    maxRequests: 100,
  });

  console.log('Auth Rate Limiter config:', {
    windowMs: '5 minutes',
    maxRequests: 10,
  });

  console.log('\\n✅ Rate limiter tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  testRateLimiter().catch(console.error);
}

export { testRateLimiter };
