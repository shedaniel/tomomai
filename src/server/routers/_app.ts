import { router } from '@/lib/trpc';
import { userRouter } from './user';
import { dbRouter } from './db';
import { adminRouter } from './admin';

export const appRouter = router({
  user: userRouter,
  db: dbRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
