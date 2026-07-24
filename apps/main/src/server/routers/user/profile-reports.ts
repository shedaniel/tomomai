import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { profileReports, user } from "@/lib/db/schema-pg";
import { profileReportLimiter } from "@/lib/security/redis-rate-limit";
import { protectedProcedure, router } from "@/lib/trpc";
import {
  profileReportInputSchema,
  submitProfileReport,
} from "@/server/services/profile-reports";

export const profileReportsRouter = router({
  submitProfileReport: protectedProcedure
    .input(profileReportInputSchema)
    .mutation(async ({ ctx, input }) => {
      return submitProfileReport(ctx.session.user.id, input, {
        async findTarget(username) {
          const [target] = await db
            .select({
              id: user.id,
              publishProfile: user.publishProfile,
              profileDescription: user.profileDescription,
            })
            .from(user)
            .where(eq(user.username, username))
            .limit(1);
          return target ?? null;
        },
        checkRateLimit(reporterUserId) {
          return profileReportLimiter.check(reporterUserId);
        },
        async insertReport(values) {
          const [report] = await db
            .insert(profileReports)
            .values(values)
            .returning({ id: profileReports.id });
          return report!;
        },
      });
    }),
});
