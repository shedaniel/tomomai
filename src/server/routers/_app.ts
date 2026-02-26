import { router } from '@/lib/trpc';
import { userRouter } from './user';
import { dbRouter } from './db';
import { adminRouter } from './admin';
import { developerRouter } from './developer';
import { storeRouter } from './store';
import { usernameRouter } from './username';

export const appRouter = router({
  user: userRouter,
  db: dbRouter,
  admin: adminRouter,
  developer: developerRouter,
  store: storeRouter,
  username: usernameRouter,
});

export type AppRouter = typeof appRouter;
