import { router } from '@/lib/trpc';
import { usersRouter } from './users';
import { databaseRouter } from './database';

export const adminRouter = router({
  users: usersRouter,
  database: databaseRouter,
});
