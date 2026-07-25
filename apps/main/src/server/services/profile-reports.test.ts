import { describe, expect, it, vi } from "vitest";

import {
  DUPLICATE_PROFILE_REPORT_MESSAGE,
  PROFILE_REPORT_RATE_LIMIT_MESSAGE,
  PROFILE_REPORT_REASONS,
  STALE_PROFILE_REPORT_MESSAGE,
  dismissProfileReport,
  profileReportInputSchema,
  removeReportedProfileDescription,
  submitProfileReport,
  type SubmitProfileReportDependencies,
} from "./profile-reports";

function createSubmitDependencies(
  overrides: Partial<SubmitProfileReportDependencies> = {},
): SubmitProfileReportDependencies {
  return {
    findTarget: vi.fn().mockResolvedValue({
      id: "target-user",
      publishProfile: true,
      profileDescription: "Reported **description**",
    }),
    checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
    insertReport: vi.fn().mockResolvedValue({ id: "report-id" }),
    ...overrides,
  };
}

describe("profile report input", () => {
  it.each(PROFILE_REPORT_REASONS)("accepts the %s reason", (reason) => {
    expect(
      profileReportInputSchema.parse({
        targetUserId: "target-user",
        reason,
        details: " context ",
      }),
    ).toEqual({ targetUserId: "target-user", reason, details: "context" });
  });

  it("rejects the legacy username-only input", () => {
    expect(
      profileReportInputSchema.safeParse({ username: "renamed-user", reason: "spam" }).success,
    ).toBe(false);
  });

  it("rejects unsupported reasons and details over 1,000 characters", () => {
    expect(
      profileReportInputSchema.safeParse({
        targetUserId: "target-user",
        reason: "copyright",
      }).success,
    ).toBe(false);
    expect(
      profileReportInputSchema.safeParse({
        targetUserId: "target-user",
        reason: "other",
        details: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });
});

describe("submitProfileReport", () => {
  it("stores the current description as an immutable snapshot", async () => {
    const dependencies = createSubmitDependencies();

    await expect(
      submitProfileReport(
        "reporter-user",
        { targetUserId: "target-user", reason: "spam", details: " evidence " },
        dependencies,
      ),
    ).resolves.toEqual({ reportId: "report-id", status: "pending" });
    expect(dependencies.findTarget).toHaveBeenCalledWith("target-user");

    expect(dependencies.insertReport).toHaveBeenCalledWith({
      reporterUserId: "reporter-user",
      targetUserId: "target-user",
      reason: "spam",
      details: " evidence ",
      descriptionSnapshot: "Reported **description**",
    });
  });

  it.each([
    null,
    { id: "target-user", publishProfile: false, profileDescription: "hidden" },
    { id: "target-user", publishProfile: true, profileDescription: null },
  ])("rejects missing or unpublished descriptions", async (target) => {
    const dependencies = createSubmitDependencies({
      findTarget: vi.fn().mockResolvedValue(target),
    });

    await expect(
      submitProfileReport(
        "reporter-user",
        { targetUserId: "target-user", reason: "other" },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(dependencies.checkRateLimit).not.toHaveBeenCalled();
  });

  it("rejects self-reporting before consuming rate limit", async () => {
    const dependencies = createSubmitDependencies({
      findTarget: vi.fn().mockResolvedValue({
        id: "reporter-user",
        publishProfile: true,
        profileDescription: "description",
      }),
    });

    await expect(
      submitProfileReport(
        "reporter-user",
        { targetUserId: "reporter-user", reason: "other" },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dependencies.checkRateLimit).not.toHaveBeenCalled();
  });

  it("converts the pending-report unique conflict", async () => {
    const dependencies = createSubmitDependencies({
      insertReport: vi.fn().mockRejectedValue({
        code: "23505",
        constraint_name: "profile_reports_pending_reporter_target_idx",
      }),
    });

    await expect(
      submitProfileReport(
        "reporter-user",
        { targetUserId: "target-user", reason: "spam" },
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: DUPLICATE_PROFILE_REPORT_MESSAGE,
    });
  });

  it("allows five reports per reporter and rejects the sixth", async () => {
    let consumed = 0;
    const dependencies = createSubmitDependencies({
      checkRateLimit: vi.fn().mockImplementation(async () => ({ limited: ++consumed > 5 })),
      insertReport: vi.fn().mockImplementation(async () => ({ id: `report-${consumed}` })),
    });

    for (let index = 0; index < 5; index += 1) {
      await expect(
        submitProfileReport(
          "reporter-user",
          { targetUserId: `target-user-${index}`, reason: "spam" },
          dependencies,
        ),
      ).resolves.toMatchObject({ status: "pending" });
    }

    await expect(
      submitProfileReport(
        "reporter-user",
        { targetUserId: "target-user-6", reason: "spam" },
        dependencies,
      ),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: PROFILE_REPORT_RATE_LIMIT_MESSAGE,
    });
    expect(dependencies.insertReport).toHaveBeenCalledTimes(5);
  });
});

describe("admin profile report transitions", () => {
  it("dismisses only a pending report", async () => {
    const dismissPendingReport = vi.fn().mockResolvedValue(true);
    await expect(
      dismissProfileReport(
        { reportId: "63b7adf0-51a8-46ad-b2f6-327770e94086", resolutionNote: " reviewed " },
        { dismissPendingReport },
      ),
    ).resolves.toEqual({
      reportId: "63b7adf0-51a8-46ad-b2f6-327770e94086",
      status: "dismissed",
    });
    expect(dismissPendingReport).toHaveBeenCalledWith(
      expect.objectContaining({ resolutionNote: " reviewed " }),
    );

    await expect(
      dismissProfileReport(
        { reportId: "63b7adf0-51a8-46ad-b2f6-327770e94086" },
        { dismissPendingReport: vi.fn().mockResolvedValue(false) },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", message: STALE_PROFILE_REPORT_MESSAGE });
  });

  it("clears the description and resolves every pending report for the target", async () => {
    const reports = [
      { id: "selected", targetUserId: "target", status: "pending" },
      { id: "also-pending", targetUserId: "target", status: "pending" },
      { id: "dismissed", targetUserId: "target", status: "dismissed" },
      { id: "other-target", targetUserId: "other", status: "pending" },
    ];
    let description: string | null = "current description";

    const dependencies = {
      async transaction<T>(
        callback: (transaction: {
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
        }) => Promise<T>,
      ) {
        return callback({
          async getPendingReportForUpdate(reportId) {
            const report = reports.find(
              (candidate) => candidate.id === reportId && candidate.status === "pending",
            );
            return report
              ? { targetUserId: report.targetUserId, targetUsername: "target-name" }
              : null;
          },
          async clearTargetDescription() {
            description = null;
          },
          async resolvePendingReports(values) {
            for (const report of reports) {
              if (report.targetUserId === values.targetUserId && report.status === "pending") {
                report.status = "removed";
              }
            }
          },
        });
      },
    };

    await expect(
      removeReportedProfileDescription(
        { reportId: "selected", resolutionNote: "policy violation" },
        dependencies,
      ),
    ).resolves.toEqual({ targetUserId: "target", targetUsername: "target-name" });
    expect(description).toBeNull();
    expect(reports.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "selected", status: "removed" },
      { id: "also-pending", status: "removed" },
      { id: "dismissed", status: "dismissed" },
      { id: "other-target", status: "pending" },
    ]);

    await expect(
      removeReportedProfileDescription({ reportId: "selected" }, dependencies),
    ).rejects.toMatchObject({ code: "CONFLICT", message: STALE_PROFILE_REPORT_MESSAGE });
  });
});
