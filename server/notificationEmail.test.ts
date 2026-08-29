import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistEmailDeliveries, shouldDeliverEmail, confirmedGameDelivery, type NotificationPreferenceSnapshot } from "./notificationService";
import { resetEmailTransporter, sendEmail } from "./emailService";
import { ENV } from "./_core/env";

const preferences: NotificationPreferenceSnapshot = { inAppEnabled: true, emailEnabled: true, gameUpdatesEnabled: true, waitlistUpdatesEnabled: true };

describe("email preference gating", () => {
  it("delivers email only when the master switch and the type gate agree", () => {
    expect(shouldDeliverEmail(preferences, "game_confirmed")).toBe(true);
    expect(shouldDeliverEmail({ ...preferences, emailEnabled: false }, "game_confirmed")).toBe(false);
    expect(shouldDeliverEmail({ ...preferences, gameUpdatesEnabled: false }, "organizer_update")).toBe(false);
    expect(shouldDeliverEmail({ ...preferences, waitlistUpdatesEnabled: false }, "waitlist_promoted")).toBe(false);
    expect(shouldDeliverEmail(undefined, "game_confirmed")).toBe(false);
  });
});

describe("persistEmailDeliveries", () => {
  beforeEach(() => resetEmailTransporter());

  function makeRepository(email: string | null) {
    const values = vi.fn().mockResolvedValue([]);
    return {
      getEmailForUser: vi.fn().mockResolvedValue(email),
      insert: vi.fn().mockReturnValue({ values }),
      values,
    };
  }

  it("records a sent delivery record when the transporter succeeds", async () => {
    const repository = makeRepository("player@example.com");
    const sender = vi.fn().mockResolvedValue("sent");
    const results = await persistEmailDeliveries(repository, [{ delivery: confirmedGameDelivery(7, 3, "Saturday Rally", "confirmed"), notificationId: 42 }], new Map([[7, preferences]]), sender);
    expect(sender).toHaveBeenCalledWith("player@example.com", expect.stringContaining("PicklePlay"), expect.stringContaining("Saturday Rally"));
    expect(results).toEqual([{ userId: 7, notificationId: 42, state: "sent" }]);
    expect(repository.values).toHaveBeenCalledWith(expect.objectContaining({ notificationId: 42, channel: "email", state: "sent" }));
  });

  it("records a suppressed record when SMTP is not configured", async () => {
    const repository = makeRepository("player@example.com");
    const sender = vi.fn().mockResolvedValue("suppressed");
    const results = await persistEmailDeliveries(repository, [{ delivery: confirmedGameDelivery(7, 3, "Saturday Rally", "confirmed"), notificationId: 42 }], new Map([[7, preferences]]), sender);
    expect(results[0].state).toBe("suppressed");
    expect(repository.values).toHaveBeenCalledWith(expect.objectContaining({ state: "suppressed" }));
  });

  it("skips users whose preferences disallow email", async () => {
    const repository = makeRepository("player@example.com");
    const sender = vi.fn().mockResolvedValue("sent");
    const results = await persistEmailDeliveries(repository, [{ delivery: confirmedGameDelivery(7, 3, "Saturday Rally", "confirmed"), notificationId: 42 }], new Map([[7, { ...preferences, emailEnabled: false }]]), sender);
    expect(results).toEqual([]);
    expect(sender).not.toHaveBeenCalled();
    expect(repository.getEmailForUser).not.toHaveBeenCalled();
  });

  it("does nothing without a user-email lookup on the repository", async () => {
    const sender = vi.fn().mockResolvedValue("sent");
    const results = await persistEmailDeliveries({ insert: vi.fn() }, [{ delivery: confirmedGameDelivery(7, 3, "Saturday Rally", "confirmed"), notificationId: 42 }], new Map([[7, preferences]]), sender);
    expect(results).toEqual([]);
    expect(sender).not.toHaveBeenCalled();
  });
});

describe("emailService transporter gating", () => {
  beforeEach(() => resetEmailTransporter());

  it("suppresses without SMTP configuration instead of attempting delivery", async () => {
    const result = await sendEmail("player@example.com", "Subject", "Body", { smtpUrl: "", from: "" });
    expect(result).toBe("suppressed");
    expect(ENV.smtpUrl).toBe("");
  });
});
