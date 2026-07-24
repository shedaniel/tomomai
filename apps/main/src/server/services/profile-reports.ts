import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const PROFILE_REPORT_REASONS = [
  "harassment",
  "hate",
  "sexual",
  "violence",
  "spam",
  "impersonation",
  "other",
] as const;

export const PROFILE_REPORT_STATUSES = ["pending", "dismissed", "removed"] as const;

export const profileReportInputSchema = z.object({
  username: z.string(),
  reason: z.enum(PROFILE_REPORT_REASONS),
  details: z.string().max(1000).trim().optional(),
});

export const profileReportListInputSchema = z.object({
  status: z.enum(PROFILE_REPORT_STATUSES),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
});

const resolutionNoteSchema = z.string().max(1000).trim().optional();

export const resolveProfileReportInputSchema = z.object({
  reportId: z.string().uuid(),
  resolutionNote: resolutionNoteSchema,
});

export const DUPLICATE_PROFILE_REPORT_MESSAGE = "You already reported this profile";
export const PROFILE_REPORT_RATE_LIMIT_MESSAGE =
  "You have submitted too many profile reports. Please try again later";
export const STALE_PROFILE_REPORT_MESSAGE = "This profile report is no longer pending";

export interface ReportableProfile {
  id: string;
  publishProfile: boolean;
  profileDescription: string | null;
}

export interface SubmitProfileReportDependencies {
  findTarget(username: string): Promise<ReportableProfile | null>;
  checkRateLimit(reporterUserId: string): Promise<{ limited: boolean }>;
  insertReport(values: {
    reporterUserId: string;
    targetUserId: string;
    reason: (typeof PROFILE_REPORT_REASONS)[number];
    details: string | null;
    descriptionSnapshot: string;
  }): Promise<{ id: string }>;
}

function isPendingReportConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const databaseError = error as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
  const constraint = databaseError.constraint_name ?? databaseError.constraint;
  return (
    databaseError.code === "23505" &&
    constraint === "profile_reports_pending_reporter_target_idx"
  );
}

export async function submitProfileReport(
  reporterUserId: string,
  input: z.infer<typeof profileReportInputSchema>,
  dependencies: SubmitProfileReportDependencies,
): Promise<{ reportId: string; status: "pending" }> {
  const target = await dependencies.findTarget(input.username);
  if (!target?.publishProfile || !target.profileDescription) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Published profile description not found",
    });
  }

  if (target.id === reporterUserId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "You cannot report your own profile",
    });
  }

  const rateLimit = await dependencies.checkRateLimit(reporterUserId);
  if (rateLimit.limited) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: PROFILE_REPORT_RATE_LIMIT_MESSAGE,
    });
  }

  try {
    const report = await dependencies.insertReport({
      reporterUserId,
      targetUserId: target.id,
      reason: input.reason,
      details: input.details || null,
      descriptionSnapshot: target.profileDescription,
    });
    return { reportId: report.id, status: "pending" };
  } catch (error) {
    if (isPendingReportConflict(error)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: DUPLICATE_PROFILE_REPORT_MESSAGE,
      });
    }
    throw error;
  }
}

export interface DismissProfileReportDependencies {
  dismissPendingReport(values: {
    reportId: string;
    resolutionNote: string | null;
    resolvedAt: Date;
  }): Promise<boolean>;
}

export async function dismissProfileReport(
  input: z.infer<typeof resolveProfileReportInputSchema>,
  dependencies: DismissProfileReportDependencies,
): Promise<{ reportId: string; status: "dismissed" }> {
  const dismissed = await dependencies.dismissPendingReport({
    reportId: input.reportId,
    resolutionNote: input.resolutionNote || null,
    resolvedAt: new Date(),
  });

  if (!dismissed) {
    throw new TRPCError({ code: "CONFLICT", message: STALE_PROFILE_REPORT_MESSAGE });
  }

  return { reportId: input.reportId, status: "dismissed" };
}

export interface ProfileReportRemovalTransaction {
  getPendingReportForUpdate(reportId: string): Promise<{
    targetUserId: string;
    targetUsername: string;
  } | null>;
  clearTargetDescription(targetUserId: string, updatedAt: Date): Promise<void>;
  resolvePendingReports(values: {
    targetUserId: string;
    resolutionNote: string | null;
    resolvedAt: Date;
  }): Promise<void>;
}

export interface RemoveProfileDescriptionDependencies {
  transaction<T>(
    callback: (transaction: ProfileReportRemovalTransaction) => Promise<T>,
  ): Promise<T>;
}

export async function removeReportedProfileDescription(
  input: z.infer<typeof resolveProfileReportInputSchema>,
  dependencies: RemoveProfileDescriptionDependencies,
): Promise<{ targetUserId: string; targetUsername: string }> {
  return dependencies.transaction(async (transaction) => {
    const report = await transaction.getPendingReportForUpdate(input.reportId);
    if (!report) {
      throw new TRPCError({ code: "CONFLICT", message: STALE_PROFILE_REPORT_MESSAGE });
    }

    const resolvedAt = new Date();
    await transaction.clearTargetDescription(report.targetUserId, resolvedAt);
    await transaction.resolvePendingReports({
      targetUserId: report.targetUserId,
      resolutionNote: input.resolutionNote || null,
      resolvedAt,
    });

    return report;
  });
}
