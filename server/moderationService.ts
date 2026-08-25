import { canReviewCommunityReports, CommunityRole } from "./communityPolicy";

export type ModerationRepository<T> = {
  listReports: () => Promise<T[]>;
  setReportStatus: (reportId: number, status: "reviewing" | "closed") => Promise<void>;
};

function requireReviewAccess(role: CommunityRole) {
  if (!canReviewCommunityReports(role)) throw new Error("Moderator access is required to review reports.");
}

export function canApplyReportSanction(role: CommunityRole, sanction: "none" | "warning" | "suspension" | "ban") {
  return canReviewCommunityReports(role) && (sanction !== "ban" || role === "admin");
}

export function assertOpenReportTransition(status: "open" | "reviewing" | "closed", action: "assign" | "resolve") {
  if (status === "closed") throw new Error(action === "assign" ? "Closed reports cannot be assigned." : "This report has already been resolved.");
}

export function assertReportAvailableForTransition(report: { status: "open" | "reviewing" | "closed" } | undefined, action: "assign" | "resolve") {
  if (!report) throw new Error("This report is no longer available.");
  assertOpenReportTransition(report.status, action);
}

export async function listReportsForReviewer<T>(repository: ModerationRepository<T>, role: CommunityRole) {
  requireReviewAccess(role);
  return repository.listReports();
}

export async function setReportReviewStatus<T>(repository: ModerationRepository<T>, role: CommunityRole, reportId: number, status: "reviewing" | "closed") {
  requireReviewAccess(role);
  await repository.setReportStatus(reportId, status);
  return { updated: true };
}
