import { describe, expect, it, vi } from "vitest";
import { assertOpenReportTransition, assertReportAvailableForTransition, canApplyReportSanction, listReportsForReviewer, prepareReportAssignment, prepareReportResolution, sanctionUserStatus, setReportReviewStatus } from "./moderationService";

describe("moderation review service", () => {
  function makeStatusRepository(status: "open" | "reviewing" | "closed" | undefined) {
    return {
      findReport: vi.fn().mockResolvedValue(status ? { status } : undefined),
      setReportStatus: vi.fn().mockResolvedValue(undefined),
      writeAudit: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("rejects a player or organizer before any report query is executed", async () => {
    const repository = makeStatusRepository("open");
    await expect(listReportsForReviewer({ listReports: vi.fn(), setReportStatus: vi.fn() }, "player")).rejects.toThrow("Moderator access");
    await expect(setReportReviewStatus(repository, { id: 2, role: "organizer" }, 4, "closed")).rejects.toThrow("Moderator access");
    expect(repository.findReport).not.toHaveBeenCalled();
    expect(repository.setReportStatus).not.toHaveBeenCalled();
  });

  it("permits moderators and admins to review persisted reports and audits the transition", async () => {
    const repository = makeStatusRepository("open");
    await expect(listReportsForReviewer({ listReports: vi.fn().mockResolvedValue([{ id: 4 }]), setReportStatus: vi.fn() }, "moderator")).resolves.toEqual([{ id: 4 }]);
    await expect(setReportReviewStatus(repository, { id: 3, role: "admin" }, 4, "reviewing")).resolves.toEqual({ updated: true });
    expect(repository.setReportStatus).toHaveBeenCalledWith(4, "reviewing");
    expect(repository.writeAudit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 3, eventType: "report_status_changed", subjectId: 4 }));
  });

  it("blocks status changes on closed reports instead of letting them reopen", async () => {
    const repository = makeStatusRepository("closed");
    await expect(setReportReviewStatus(repository, { id: 3, role: "moderator" }, 9, "reviewing")).rejects.toThrow("already been resolved");
    expect(repository.setReportStatus).not.toHaveBeenCalled();
    expect(repository.writeAudit).not.toHaveBeenCalled();
  });

  it("rejects status changes for nonexistent reports", async () => {
    const repository = makeStatusRepository(undefined);
    await expect(setReportReviewStatus(repository, { id: 3, role: "admin" }, 404, "closed")).rejects.toThrow("no longer available");
    expect(repository.setReportStatus).not.toHaveBeenCalled();
  });

  it("treats a redundant open-to-reviewing transition as a no-op without an audit event", async () => {
    const repository = makeStatusRepository("reviewing");
    await expect(setReportReviewStatus(repository, { id: 3, role: "moderator" }, 9, "reviewing")).resolves.toEqual({ updated: false });
    expect(repository.setReportStatus).not.toHaveBeenCalled();
    expect(repository.writeAudit).not.toHaveBeenCalled();
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
    expect(prepareReportResolution({ id: 3, role: "moderator" }, { reportId: 9, resolutionReason: "Guidance issued", resolutionNote: "Host acknowledged policy", sanction: "warning" }, resolvedAt)).toEqual({ update: { status: "closed", assignedTo: 3, resolutionReason: "Guidance issued", resolutionNote: "Host acknowledged policy", sanction: "warning", subjectUserId: null, resolvedAt }, audit: { actorId: 3, eventType: "report_resolved", subjectType: "report", subjectId: 9, metadata: JSON.stringify({ resolutionReason: "Guidance issued", sanction: "warning", subjectUserId: null }) } });
  });

  it("rejects undocumented resolutions and moderator bans before database writes", () => {
    expect(() => prepareReportResolution({ id: 3, role: "moderator" }, { reportId: 9, resolutionReason: " ", sanction: "warning" })).toThrow("documented resolution reason");
    expect(() => prepareReportResolution({ id: 3, role: "moderator" }, { reportId: 9, resolutionReason: "Policy breach", sanction: "ban" })).toThrow("Only platform administrators can apply a ban");
  });

  it("requires a subject member before a suspension or ban can be prepared", () => {
    expect(() => prepareReportResolution({ id: 3, role: "admin" }, { reportId: 9, resolutionReason: "Repeated harassment", sanction: "suspension" })).toThrow("A community member is required");
    expect(() => prepareReportResolution({ id: 3, role: "admin" }, { reportId: 9, resolutionReason: "Repeated harassment", sanction: "ban", subjectUserId: 3 })).toThrow("your own account");
    expect(() => prepareReportResolution({ id: 3, role: "admin" }, { reportId: 9, resolutionReason: "Repeated harassment", sanction: "ban", subjectUserId: 12 })).not.toThrow();
  });

  it("maps sanctions onto enforceable account statuses", () => {
    expect(sanctionUserStatus("suspension")).toBe("suspended");
    expect(sanctionUserStatus("ban")).toBe("banned");
    expect(sanctionUserStatus("warning")).toBeNull();
    expect(sanctionUserStatus("none")).toBeNull();
  });
});
