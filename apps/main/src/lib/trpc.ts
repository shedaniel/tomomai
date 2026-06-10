import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getRequestId, runWithLogger } from '@/lib/request-logger';
import superjson from 'superjson';
import type { NextRequest } from 'next/server';

// Create context for tRPC
export async function createTRPCContext(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  return {
    session,
    req,
  };
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// Initialize tRPC
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

// tRPC error codes that represent a server-side failure (5xx-equivalent) worth
// an error-level log. Everything else is an expected client-side outcome
// (auth/validation/not-found) and is logged at warn so it stays queryable
// without flooding Axiom.
const SERVER_ERROR_CODES = new Set<TRPCError['code']>([
  'INTERNAL_SERVER_ERROR',
  'NOT_IMPLEMENTED',
  'BAD_GATEWAY',
  'SERVICE_UNAVAILABLE',
  'GATEWAY_TIMEOUT',
]);

// Bind the ambient request logger for every procedure, so lib code reached
// from tRPC picks up route/requestId via getLogger() (see request-logger.ts),
// and log failures with a level chosen by error code. tRPC catches procedure
// errors and returns them as responses, so they never reach instrumentation's
// onRequestError — this middleware is where they get logged.
const withRequestLogger = t.middleware(({ ctx, path, next }) => {
  const requestId = getRequestId(ctx.req);
  const log = logger.child({ route: `trpc/${path}`, requestId });
  return runWithLogger(log, async () => {
    const result = await next();
    if (!result.ok) {
      const { error } = result;
      if (SERVER_ERROR_CODES.has(error.code)) {
        log.error({ err: error, status: error.code }, 'tRPC procedure failed');
      } else {
        log.warn({ status: error.code }, `tRPC procedure failed: ${error.message}`);
      }
    }
    return result;
  });
});

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure.use(withRequestLogger);
export const middleware = t.middleware;

// Protected procedure that requires authentication
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});
