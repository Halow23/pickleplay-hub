import { canReviewCommunityReports, CommunityRole } from "./communityPolicy";

export type ModerationRepository<T> = {
  listReports: () => Promise<T[]>;
  setReportStatus: (reportId: number, status: "reviewing" | "closed") => Promise<void>;
};

function requireReviewAccess(role: CommunityRole) {
  if (!canReviewCommunityReports(role)) throw new Error("Moderator access is required to review reports.");
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
