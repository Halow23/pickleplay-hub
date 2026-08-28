import { canReviewCommunityReports, CommunityRole } from "./communityPolicy";

export type ModerationRepository<T> = {
  listReports: () => Promise<T[]>;
  setReportStatus: (reportId: number, status: "reviewing" | "closed") => Promise<void>;
};

export type ReportStatusRow = { status: "open" | "reviewing" | "closed" };

export type StatusTransitionRepository = {
  findReport: (reportId: number) => Promise<ReportStatusRow | undefined>;
  setReportStatus: (reportId: number, status: "reviewing" | "closed") => Promise<void>;
  writeAudit: (audit: { actorId: number; eventType: string; subjectType: string; subjectId: number; metadata: string }) => Promise<void>;
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

export function prepareReportResolution(actor: { id: number; role: CommunityRole }, input: { reportId: number; resolutionReason: string; resolutionNote?: string; sanction: "none" | "warning" | "suspension" | "ban"; subjectUserId?: number | null }, resolvedAt = new Date()) {
  requireReviewAccess(actor.role);
  const resolutionReason = input.resolutionReason.trim();
  if (resolutionReason.length < 3) throw new Error("A documented resolution reason is required.");
  if (!canApplyReportSanction(actor.role, input.sanction)) throw new Error(input.sanction === "ban" ? "Only platform administrators can apply a ban." : "Moderator access is required to apply this sanction.");
  if (input.sanction === "suspension" || input.sanction === "ban") {
    if (!input.subjectUserId) throw new Error("A community member is required before a suspension or ban can be applied.");
    if (input.subjectUserId === actor.id) throw new Error("You cannot apply a sanction to your own account.");
  }
  const resolutionNote = input.resolutionNote?.trim() || null;
  const subjectUserId = input.subjectUserId || null;
  return { update: { status: "closed" as const, assignedTo: actor.id, resolutionReason, resolutionNote, sanction: input.sanction, subjectUserId, resolvedAt }, audit: { actorId: actor.id, eventType: "report_resolved", subjectType: "report", subjectId: input.reportId, metadata: JSON.stringify({ resolutionReason, sanction: input.sanction, subjectUserId }) } };
}

// The user status a resolved sanction translates to; warning/none leave the
// account untouched.
export function sanctionUserStatus(sanction: "none" | "warning" | "suspension" | "ban"): "suspended" | "banned" | null {
  if (sanction === "suspension") return "suspended";
  if (sanction === "ban") return "banned";
  return null;
}

export async function listReportsForReviewer<T>(repository: ModerationRepository<T>, role: CommunityRole) {
  requireReviewAccess(role);
  return repository.listReports();
}

// Direct status changes (used by the legacy "review" console action) must not
// bypass the state machine: closed reports stay closed, and every transition
// is audited just like assign/resolve.
export async function setReportReviewStatus(
  repository: StatusTransitionRepository,
  actor: { id: number; role: CommunityRole },
  reportId: number,
  status: "reviewing" | "closed"
) {
  requireReviewAccess(actor.role);
  const report = await repository.findReport(reportId);
  if (!report) throw new Error("This report is no longer available.");
  if (report.status === "closed") throw new Error("This report has already been resolved.");
  if (status === "reviewing" && report.status === "reviewing") return { updated: false };
  await repository.setReportStatus(reportId, status);
  await repository.writeAudit({
    actorId: actor.id,
    eventType: "report_status_changed",
    subjectType: "report",
    subjectId: reportId,
    metadata: JSON.stringify({ from: report.status, to: status }),
  });
  return { updated: true };
}
