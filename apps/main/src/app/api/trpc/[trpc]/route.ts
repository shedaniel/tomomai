import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/lib/trpc';
import { logger } from '@/lib/logger';
import { NextRequest } from 'next/server';

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext(req),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
          logger.error({ route: `trpc/${path ?? '<no-path>'}`, err: error }, 'tRPC procedure failed');
        }
        : undefined,
  });

export { handler as GET, handler as POST };
