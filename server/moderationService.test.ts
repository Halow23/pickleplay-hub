import { describe, expect, it, vi } from "vitest";
import { listReportsForReviewer, setReportReviewStatus } from "./moderationService";

describe("moderation review service", () => {
  it("rejects a player or organizer before any report query is executed", async () => {
    const repository = { listReports: vi.fn(), setReportStatus: vi.fn() };
    await expect(listReportsForReviewer(repository, "player")).rejects.toThrow("Moderator access");
    await expect(setReportReviewStatus(repository, "organizer", 4, "closed")).rejects.toThrow("Moderator access");
    expect(repository.listReports).not.toHaveBeenCalled();
    expect(repository.setReportStatus).not.toHaveBeenCalled();
  });

  it("permits moderators and admins to review persisted reports", async () => {
    const repository = { listReports: vi.fn().mockResolvedValue([{ id: 4 }]), setReportStatus: vi.fn().mockResolvedValue(undefined) };
    await expect(listReportsForReviewer(repository, "moderator")).resolves.toEqual([{ id: 4 }]);
    await expect(setReportReviewStatus(repository, "admin", 4, "reviewing")).resolves.toEqual({ updated: true });
    expect(repository.setReportStatus).toHaveBeenCalledWith(4, "reviewing");
  });
});
