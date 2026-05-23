import { router } from '@/lib/trpc';
import { adminProcedure } from '@/lib/admin-middleware';
import { rebuildChartPercentileBands } from '@/server/queries/percentile';

export const databaseRouter = router({
  rebuildPercentileBands: adminProcedure
    .mutation(async () => {
      const result = await rebuildChartPercentileBands();
      return { rowsInserted: result.rowsInserted };
    }),
});
