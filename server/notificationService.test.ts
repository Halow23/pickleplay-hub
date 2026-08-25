import { describe, expect, it, vi } from "vitest";
import { confirmedGameDelivery, organizerUpdateDelivery, persistInAppDeliveries, shouldDeliverInApp, waitlistPromotionDelivery } from "./notificationService";

describe("in-app notification delivery", () => {
  it("describes both confirmed and waitlisted RSVP outcomes without email delivery", () => {
    expect(confirmedGameDelivery(7, 8, "Sunset doubles", "confirmed")).toMatchObject({ userId: 7, gameId: 8, type: "game_confirmed", title: "You’re confirmed" });
    expect(confirmedGameDelivery(7, 8, "Sunset doubles", "waitlisted").body).toContain("next in line");
  });

  it("creates specific promotion and organizer-update messages", () => {
    expect(waitlistPromotionDelivery(7, 8, "Sunset doubles").type).toBe("waitlist_promoted");
    expect(organizerUpdateDelivery(7, 8, "Courts moved indoors")).toMatchObject({ type: "organizer_update", body: "Courts moved indoors" });
  });

  it("suppresses only the in-app categories a player has disabled", () => {
    expect(shouldDeliverInApp({ inAppEnabled: true, gameUpdatesEnabled: false, waitlistUpdatesEnabled: true }, "organizer_update")).toBe(false);
    expect(shouldDeliverInApp({ inAppEnabled: true, gameUpdatesEnabled: false, waitlistUpdatesEnabled: true }, "waitlist_promoted")).toBe(true);
    expect(shouldDeliverInApp({ inAppEnabled: false, gameUpdatesEnabled: true, waitlistUpdatesEnabled: true }, "game_confirmed")).toBe(false);
  });

  it("persists an in-app notification with queued outbox and delivered channel records", async () => {
    const values = vi.fn().mockResolvedValueOnce([{ insertId: 42 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const repository = { insert: vi.fn().mockReturnValue({ values }) };
    const delivery = organizerUpdateDelivery(7, 8, "Courts moved indoors");

    await expect(persistInAppDeliveries(repository, delivery)).resolves.toEqual([42]);
    expect(repository.insert).toHaveBeenCalledTimes(3);
    expect(values).toHaveBeenNthCalledWith(1, delivery);
    expect(values).toHaveBeenNthCalledWith(2, { notificationId: 42, state: "queued" });
    expect(values).toHaveBeenNthCalledWith(3, expect.objectContaining({ notificationId: 42, channel: "in_app", state: "delivered" }));
  });
});
