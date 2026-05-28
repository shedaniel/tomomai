import { TRPCError } from '@trpc/server';
import { middleware, publicProcedure } from '@/lib/trpc';

export const adminBearerAuth = middleware(async ({ ctx, next }) => {
  const authHeader = ctx.req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Missing authorization token',
    });
  }

  const adminToken = process.env.ADMIN_UPDATE_TOKEN;
  if (!adminToken) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Server misconfiguration: ADMIN_UPDATE_TOKEN not set',
    });
  }

  if (token !== adminToken) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Invalid authorization token',
    });
  }

  return next({ ctx });
});

// Export admin procedure for use in admin routers
export const adminProcedure = publicProcedure.use(adminBearerAuth);
