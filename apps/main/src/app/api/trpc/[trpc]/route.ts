import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/lib/trpc';
import { NextRequest } from 'next/server';

// onFetchStatus subscriptions hold the SSE connection open while a fetch runs
// (the worker times out at 2 minutes); allow the function to outlive that.
export const maxDuration = 130;

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext(req),
    // Errors are logged (with level by code) in the withRequestLogger tRPC
    // middleware in @/lib/trpc — see there.
  });

export { handler as GET, handler as POST };
