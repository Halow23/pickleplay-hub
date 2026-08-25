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

export function prepareReportAssignment(actor: { id: number; role: CommunityRole }, reportId: number) {
  requireReviewAccess(actor.role);
  return { update: { assignedTo: actor.id, status: "reviewing" as const }, audit: { actorId: actor.id, eventType: "report_assigned", subjectType: "report", subjectId: reportId, metadata: JSON.stringify({ assignedTo: actor.id }) } };
}

export function prepareReportResolution(actor: { id: number; role: CommunityRole }, input: { reportId: number; resolutionReason: string; resolutionNote?: string; sanction: "none" | "warning" | "suspension" | "ban" }, resolvedAt = new Date()) {
  requireReviewAccess(actor.role);
  const resolutionReason = input.resolutionReason.trim();
  if (resolutionReason.length < 3) throw new Error("A documented resolution reason is required.");
  if (!canApplyReportSanction(actor.role, input.sanction)) throw new Error(input.sanction === "ban" ? "Only platform administrators can apply a ban." : "Moderator access is required to apply this sanction.");
  const resolutionNote = input.resolutionNote?.trim() || null;
  return { update: { status: "closed" as const, assignedTo: actor.id, resolutionReason, resolutionNote, sanction: input.sanction, resolvedAt }, audit: { actorId: actor.id, eventType: "report_resolved", subjectType: "report", subjectId: input.reportId, metadata: JSON.stringify({ resolutionReason, sanction: input.sanction }) } };
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
