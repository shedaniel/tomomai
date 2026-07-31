import { and, count, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { adminProcedure } from "@/lib/admin-middleware";
import { db } from "@/lib/db";
import { profileReports, user } from "@/lib/db/schema-pg";
import { revalidatePublicProfileForUser } from "@/lib/profile-cache";
import { router } from "@/lib/trpc";
import {
  dismissProfileReport,
  profileReportListInputSchema,
  removeReportedProfileDescription,
  resolveProfileReportInputSchema,
} from "@/server/services/profile-reports";

const reporter = alias(user, "profile_report_reporter");
const target = alias(user, "profile_report_target");
const resolver = alias(user, "profile_report_resolver");

export const profileReportsRouter = router({
  list: adminProcedure
    .input(profileReportListInputSchema)
    .query(async ({ input }) => {
      const where = eq(profileReports.status, input.status);
      const [reports, [totalRow]] = await Promise.all([
        db
          .select({
            id: profileReports.id,
            reporterUserId: profileReports.reporterUserId,
            targetUserId: profileReports.targetUserId,
            reason: profileReports.reason,
            details: profileReports.details,
            descriptionSnapshot: profileReports.descriptionSnapshot,
            status: profileReports.status,
            createdAt: profileReports.createdAt,
            resolvedAt: profileReports.resolvedAt,
            resolutionNote: profileReports.resolutionNote,
            reporterUsername: reporter.username,
            targetUsername: target.username,
            currentDescription: target.profileDescription,
            resolvedByUserId: profileReports.resolvedByUserId,
            resolvedByUsername: resolver.username,
          })
          .from(profileReports)
          .innerJoin(reporter, eq(profileReports.reporterUserId, reporter.id))
          .innerJoin(target, eq(profileReports.targetUserId, target.id))
          .leftJoin(resolver, eq(profileReports.resolvedByUserId, resolver.id))
          .where(where)
          .orderBy(desc(profileReports.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: count() }).from(profileReports).where(where),
      ]);

      return { reports, total: totalRow?.count ?? 0 };
    }),

  dismiss: adminProcedure
    .input(resolveProfileReportInputSchema)
    .mutation(async ({ ctx, input }) => {
      return dismissProfileReport(input, ctx.session?.user.id ?? null, {
        async dismissPendingReport(values) {
          const [dismissed] = await db
            .update(profileReports)
            .set({
              status: "dismissed",
              resolvedAt: values.resolvedAt,
              resolvedByUserId: values.resolvedByUserId,
              resolutionNote: values.resolutionNote,
            })
            .where(
              and(
                eq(profileReports.id, values.reportId),
                eq(profileReports.status, "pending"),
              ),
            )
            .returning({ id: profileReports.id });
          return Boolean(dismissed);
        },
      });
    }),

  removeDescription: adminProcedure
    .input(resolveProfileReportInputSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await removeReportedProfileDescription(input, ctx.session?.user.id ?? null, {
        transaction(callback) {
          return db.transaction(async (transaction) => {
            return callback({
              async getPendingReportForUpdate(reportId) {
                const [report] = await transaction
                  .select({
                    targetUserId: profileReports.targetUserId,
                    targetUsername: target.username,
                  })
                  .from(profileReports)
                  .innerJoin(target, eq(profileReports.targetUserId, target.id))
                  .where(
                    and(
                      eq(profileReports.id, reportId),
                      eq(profileReports.status, "pending"),
                    ),
                  )
                  .for("update")
                  .limit(1);
                if (!report?.targetUsername) return null;
                return {
                  targetUserId: report.targetUserId,
                  targetUsername: report.targetUsername,
                };
              },
              async clearTargetDescription(targetUserId, updatedAt) {
                await transaction
                  .update(user)
                  .set({ profileDescription: null, updatedAt })
                  .where(eq(user.id, targetUserId));
              },
              async resolvePendingReports(values) {
                await transaction
                  .update(profileReports)
                  .set({
                    status: "removed",
                    resolvedAt: values.resolvedAt,
                    resolvedByUserId: values.resolvedByUserId,
                    resolutionNote: values.resolutionNote,
                  })
                  .where(
                    and(
                      eq(profileReports.targetUserId, values.targetUserId),
                      eq(profileReports.status, "pending"),
                    ),
                  );
              },
            });
          });
        },
      });

      await revalidatePublicProfileForUser(result.targetUserId);
      return result;
    }),
});
