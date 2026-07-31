import { router } from '@/lib/trpc';
import { usersRouter } from './users';
import { databaseRouter } from './database';
import { profileReportsRouter } from './profile-reports';

export const adminRouter = router({
  users: usersRouter,
  database: databaseRouter,
  profileReports: profileReportsRouter,
});
