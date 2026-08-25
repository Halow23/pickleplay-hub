import { describe, expect, it, vi } from "vitest";
import { assertOpenReportTransition, assertReportAvailableForTransition, canApplyReportSanction, listReportsForReviewer, prepareReportAssignment, prepareReportResolution, setReportReviewStatus } from "./moderationService";

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

  it("allows moderators to document proportionate sanctions but reserves bans for administrators", () => {
    expect(canApplyReportSanction("moderator", "warning")).toBe(true);
    expect(canApplyReportSanction("moderator", "suspension")).toBe(true);
    expect(canApplyReportSanction("moderator", "ban")).toBe(false);
    expect(canApplyReportSanction("admin", "ban")).toBe(true);
    expect(canApplyReportSanction("player", "warning")).toBe(false);
  });

  it("blocks assignment and resolution transitions once a report is closed", () => {
    expect(() => assertOpenReportTransition("open", "assign")).not.toThrow();
    expect(() => assertOpenReportTransition("reviewing", "resolve")).not.toThrow();
    expect(() => assertOpenReportTransition("closed", "assign")).toThrow("Closed reports cannot be assigned.");
    expect(() => assertOpenReportTransition("closed", "resolve")).toThrow("already been resolved");
  });

  it("rejects nonexistent reports before a transition can be persisted or audited", () => {
    expect(() => assertReportAvailableForTransition(undefined, "assign")).toThrow("no longer available");
    expect(() => assertReportAvailableForTransition({ status: "closed" }, "resolve")).toThrow("already been resolved");
    expect(() => assertReportAvailableForTransition({ status: "open" }, "assign")).not.toThrow();
  });

  it("prepares documented moderator workflow writes and matching audit events", () => {
    const resolvedAt = new Date("2026-08-25T00:00:00Z");
    expect(prepareReportAssignment({ id: 3, role: "moderator" }, 9)).toEqual({ update: { assignedTo: 3, status: "reviewing" }, audit: { actorId: 3, eventType: "report_assigned", subjectType: "report", subjectId: 9, metadata: JSON.stringify({ assignedTo: 3 }) } });
    expect(prepareReportResolution({ id: 3, role: "moderator" }, { reportId: 9, resolutionReason: "Guidance issued", resolutionNote: "Host acknowledged policy", sanction: "warning" }, resolvedAt)).toEqual({ update: { status: "closed", assignedTo: 3, resolutionReason: "Guidance issued", resolutionNote: "Host acknowledged policy", sanction: "warning", resolvedAt }, audit: { actorId: 3, eventType: "report_resolved", subjectType: "report", subjectId: 9, metadata: JSON.stringify({ resolutionReason: "Guidance issued", sanction: "warning" }) } });
  });

  it("rejects undocumented resolutions and moderator bans before database writes", () => {
    expect(() => prepareReportResolution({ id: 3, role: "moderator" }, { reportId: 9, resolutionReason: " ", sanction: "warning" })).toThrow("documented resolution reason");
    expect(() => prepareReportResolution({ id: 3, role: "moderator" }, { reportId: 9, resolutionReason: "Policy breach", sanction: "ban" })).toThrow("Only platform administrators can apply a ban");
  });
});
