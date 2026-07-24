"use client";

import type { AppRouter } from "@/server/routers/_app";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AnimatedDialog,
  AnimatedDialogContent,
  Badge,
  Button,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tomomai/ui";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import superjson from "superjson";

interface ProfileReportsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminToken: string;
}

type ReportStatus = "pending" | "dismissed" | "removed";
type ProfileReport =
  inferRouterOutputs<AppRouter>["admin"]["profileReports"]["list"]["reports"][number];

type VisibleError = {
  title: string;
  message?: string;
};

const PAGE_SIZE = 20;
const REPORT_STATUSES: readonly ReportStatus[] = [
  "pending",
  "dismissed",
  "removed",
];

function errorMessage(error: unknown): string | undefined {
  return error instanceof Error && error.message ? error.message : undefined;
}

export function ProfileReportsDialog({
  open,
  onOpenChange,
  adminToken,
}: ProfileReportsDialogProps) {
  const t = useTranslations("Admin.profileReports");
  const locale = useLocale();
  const [reports, setReports] = useState<ProfileReport[]>([]);
  const [status, setStatus] = useState<ReportStatus>("pending");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actingReportId, setActingReportId] = useState<string | null>(null);
  const [removeCandidate, setRemoveCandidate] = useState<ProfileReport | null>(
    null,
  );
  const [visibleError, setVisibleError] = useState<VisibleError | null>(null);
  const latestRequestId = useRef(0);

  const adminTrpc = useMemo(
    () =>
      createTRPCClient<AppRouter>({
        links: [
          httpBatchLink({
            url: "/api/trpc",
            transformer: superjson,
            headers() {
              return {
                authorization: `Bearer ${adminToken}`,
              };
            },
          }),
        ],
      }),
    [adminToken],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const fetchReports = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setLoading(true);
    setVisibleError(null);

    try {
      const result = await adminTrpc.admin.profileReports.list.query({
        status,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (requestId !== latestRequestId.current) return;
      const nextReports = result.reports;

      if (page > 0 && nextReports.length === 0 && result.total > 0) {
        setPage(Math.ceil(result.total / PAGE_SIZE) - 1);
        return;
      }

      setReports(nextReports);
      setTotal(result.total);
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      setVisibleError({
        title: t("loadErrorTitle"),
        message: errorMessage(error),
      });
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, [adminTrpc, page, status, t]);

  useEffect(() => {
    if (open) {
      void fetchReports();
    }
  }, [fetchReports, open]);

  const handleStatusChange = (nextStatus: ReportStatus) => {
    setStatus(nextStatus);
    setPage(0);
    setReports([]);
    setTotal(0);
    setVisibleError(null);
  };

  const dismissReport = async (reportId: string) => {
    setActingReportId(reportId);
    setVisibleError(null);

    try {
      await adminTrpc.admin.profileReports.dismiss.mutate({ reportId });
      toast.success(t("dismissSuccess"));
      await fetchReports();
    } catch (error) {
      const message = errorMessage(error);
      setVisibleError({ title: t("actionError"), message });
      toast.error(message ?? t("actionError"));
    } finally {
      setActingReportId(null);
    }
  };

  const removeDescription = async (reportId: string) => {
    setActingReportId(reportId);
    setVisibleError(null);

    try {
      await adminTrpc.admin.profileReports.removeDescription.mutate({
        reportId,
      });
      toast.success(t("removeSuccess"));
      await fetchReports();
    } catch (error) {
      const message = errorMessage(error);
      setVisibleError({ title: t("actionError"), message });
      toast.error(message ?? t("actionError"));
    } finally {
      setActingReportId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstVisible = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastVisible = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <>
      <AnimatedDialog open={open} onOpenChange={onOpenChange} modal={false}>
        <AnimatedDialogContent className="flex h-[95vh] w-[95vw] max-w-[95vw]! flex-col shadow sm:max-w-[95vw]!">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t("summary", {
                total,
                page: page + 1,
                totalPages,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label
                className="text-sm font-medium"
                htmlFor="profile-report-status"
              >
                {t("filterLabel")}
              </label>
              <Select
                value={status}
                onValueChange={(value) =>
                  handleStatusChange(value as ReportStatus)
                }
              >
                <SelectTrigger
                  id="profile-report-status"
                  className="w-full sm:w-48"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_STATUSES.map((reportStatus) => (
                    <SelectItem key={reportStatus} value={reportStatus}>
                      {t(`filters.${reportStatus}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {visibleError && (
              <div
                className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between"
                role="alert"
              >
                <div className="space-y-1">
                  <p className="font-medium text-destructive">
                    {visibleError.title}
                  </p>
                  {visibleError.message && (
                    <p className="text-sm text-foreground">
                      {visibleError.message}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchReports()}
                  disabled={loading}
                >
                  {t("retry")}
                </Button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
              <Table>
                <TableCaption className="sr-only">
                  {t("summary", {
                    total,
                    page: page + 1,
                    totalPages,
                  })}
                </TableCaption>
                <TableHeader className="sticky top-0 z-10 bg-surface-container-high">
                  <TableRow>
                    <TableHead className="min-w-64">
                      {t("columns.report")}
                    </TableHead>
                    <TableHead className="min-w-56">
                      {t("columns.reason")}
                    </TableHead>
                    <TableHead className="min-w-80">
                      {t("columns.snapshot")}
                    </TableHead>
                    <TableHead className="min-w-80">
                      {t("columns.current")}
                    </TableHead>
                    <TableHead>{t("columns.status")}</TableHead>
                    <TableHead className="min-w-48 text-right">
                      {t("columns.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }, (_, index) => (
                      <TableRow key={index}>
                        {Array.from({ length: 6 }, (_, cellIndex) => (
                          <TableCell key={cellIndex} className="align-top">
                            <Skeleton className="h-20 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : reports.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-40 whitespace-normal text-center text-muted-foreground"
                      >
                        {t(`empty.${status}`)}
                      </TableCell>
                    </TableRow>
                  ) : (
                    reports.map((report) => {
                      const isActing = actingReportId === report.id;
                      const targetName =
                        report.targetUsername ?? report.targetUserId;
                      const reporterName =
                        report.reporterUsername ?? report.reporterUserId;

                      return (
                        <TableRow key={report.id}>
                          <TableCell className="align-top whitespace-normal">
                            <div className="space-y-1">
                              <p className="font-medium">
                                {t("target", { username: targetName })}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {t("reportedBy", {
                                  username: reporterName,
                                })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("submittedAt", {
                                  date: dateFormatter.format(
                                    new Date(report.createdAt),
                                  ),
                                })}
                              </p>
                              {report.resolvedAt && (
                                <p className="text-xs text-muted-foreground">
                                  {t("resolvedAt", {
                                    date: dateFormatter.format(
                                      new Date(report.resolvedAt),
                                    ),
                                  })}
                                </p>
                              )}
                              {report.resolutionNote && (
                                <p className="text-xs text-muted-foreground">
                                  {t("resolutionNote", {
                                    note: report.resolutionNote,
                                  })}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top whitespace-normal">
                            <div className="space-y-2">
                              <Badge variant="outline">
                                {t(`reason.${report.reason}`)}
                              </Badge>
                              {report.details && (
                                <p className="break-words text-sm">
                                  {t("details", { details: report.details })}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top whitespace-normal">
                            <div className="max-h-40 overflow-auto rounded-lg bg-surface-container-low p-3 font-mono text-xs whitespace-pre-wrap break-words">
                              {report.descriptionSnapshot}
                            </div>
                          </TableCell>
                          <TableCell className="align-top whitespace-normal">
                            {report.currentDescription ? (
                              <div className="max-h-40 overflow-auto rounded-lg bg-surface-container-low p-3 font-mono text-xs whitespace-pre-wrap break-words">
                                {report.currentDescription}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {t("noDescription")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant={
                                report.status === "pending"
                                  ? "warning"
                                  : report.status === "removed"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {t(`status.${report.status}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-top">
                            {report.status === "pending" ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isActing}
                                  onClick={() => void dismissReport(report.id)}
                                >
                                  {t("dismiss")}
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={isActing}
                                  onClick={() => setRemoveCandidate(report)}
                                >
                                  {t("remove")}
                                </Button>
                              </div>
                            ) : (
                              <span className="sr-only">
                                {t(`status.${report.status}`)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t("showing", {
                  start: firstVisible,
                  end: lastVisible,
                  total,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || loading}
                >
                  {t("previous")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(totalPages - 1, current + 1),
                    )
                  }
                  disabled={page >= totalPages - 1 || loading}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          </div>
        </AnimatedDialogContent>
      </AnimatedDialog>

      <AlertDialog
        open={removeCandidate !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRemoveCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmRemoveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmRemoveDescription", {
                username:
                  removeCandidate?.targetUsername ??
                  removeCandidate?.targetUserId ??
                  "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removeCandidate) {
                  void removeDescription(removeCandidate.id);
                }
              }}
            >
              {t("confirmRemove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
