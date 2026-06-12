import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    // Route subscriptions over SSE (httpSubscriptionLink) and everything else
    // over the batched HTTP link.
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({
        url: '/api/trpc',
        transformer: superjson,
      }),
      false: httpBatchLink({
        url: '/api/trpc',
        transformer: superjson,
        // You can pass HTTP headers you wish here (typed as Record<string, string>)
        async headers(): Promise<Record<string, string>> {
          return {};
        },
      }),
    }),
  ],
});
