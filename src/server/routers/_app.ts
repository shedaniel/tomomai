import { router } from '@/lib/trpc';
import { userRouter } from './user';
import { dbRouter } from './db';

export const appRouter = router({
  user: userRouter,
  db: dbRouter,
});

export type AppRouter = typeof appRouter;
