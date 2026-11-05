import { TRPCError } from '@trpc/server';
import { checkAdminToken } from '@/lib/admin-token';
import { middleware, publicProcedure } from '@/lib/trpc';

export const adminBearerAuth = middleware(async ({ ctx, next }) => {
  switch (checkAdminToken(ctx.req.headers.get('authorization'))) {
    case 'missing':
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing authorization token' });
    case 'unconfigured':
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Server misconfiguration: ADMIN_UPDATE_TOKEN not set' });
    case 'invalid':
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid authorization token' });
  }
  return next({ ctx });
});

export const adminProcedure = publicProcedure.use(adminBearerAuth);
