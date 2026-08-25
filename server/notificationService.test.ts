import { describe, expect, it, vi } from "vitest";
import { confirmedGameDelivery, organizerUpdateDelivery, persistInAppDeliveries, waitlistPromotionDelivery } from "./notificationService";

describe("in-app notification delivery", () => {
  it("describes both confirmed and waitlisted RSVP outcomes without email delivery", () => {
    expect(confirmedGameDelivery(7, 8, "Sunset doubles", "confirmed")).toMatchObject({ userId: 7, gameId: 8, type: "game_confirmed", title: "You’re confirmed" });
    expect(confirmedGameDelivery(7, 8, "Sunset doubles", "waitlisted").body).toContain("next in line");
  });

  it("creates specific promotion and organizer-update messages", () => {
    expect(waitlistPromotionDelivery(7, 8, "Sunset doubles").type).toBe("waitlist_promoted");
    expect(organizerUpdateDelivery(7, 8, "Courts moved indoors")).toMatchObject({ type: "organizer_update", body: "Courts moved indoors" });
  });

  it("persists in-app deliveries through the channel repository boundary", () => {
    const values = vi.fn().mockReturnValue("written");
    const repository = { insert: vi.fn().mockReturnValue({ values }) };
    const delivery = organizerUpdateDelivery(7, 8, "Courts moved indoors");

    expect(persistInAppDeliveries(repository, delivery)).toBe("written");
    expect(repository.insert).toHaveBeenCalledOnce();
    expect(values).toHaveBeenCalledWith(delivery);
  });
});
