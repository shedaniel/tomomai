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

// Bind the ambient request logger for every procedure, so lib code reached
// from tRPC picks up route/requestId via getLogger() (see request-logger.ts).
const withRequestLogger = t.middleware(({ ctx, path, next }) => {
  const requestId = getRequestId(ctx.req);
  const log = logger.child({ route: `trpc/${path}`, requestId });
  return runWithLogger(log, () => next());
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
