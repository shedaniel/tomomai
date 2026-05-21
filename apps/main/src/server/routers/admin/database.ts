import { router } from '@/lib/trpc';

export const databaseRouter = router({
  // Future procedures:
  // rebuildCache: adminProcedure.mutation(...),
  // runMigration: adminProcedure.input(...).mutation(...),
  // getTableStats: adminProcedure.query(...),
});
