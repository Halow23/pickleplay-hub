import { describe, expect, it } from "vitest";
import { canManageGame, canReviewCommunityReports, chooseWaitlistPromotion, decideRsvpState } from "./communityPolicy";

describe("PicklePlay RSVP policy", () => {
  it("confirms an RSVP only while a game has capacity", () => {
    expect(decideRsvpState(6, 5)).toBe("confirmed");
    expect(decideRsvpState(6, 6)).toBe("waitlisted");
  });

  it("selects the earliest waitlisted RSVP for promotion", () => {
    expect(chooseWaitlistPromotion(["first", "second", "third"])).toBe("first");
    expect(chooseWaitlistPromotion([])).toBeUndefined();
  });

  it("only allows the owning organizer or a platform admin to manage a game", () => {
    expect(canManageGame("organizer", 7, 7)).toBe(true);
    expect(canManageGame("organizer", 7, 8)).toBe(false);
    expect(canManageGame("player", 7, 7)).toBe(false);
    expect(canManageGame("admin", 7, 8)).toBe(true);
  });

  it("limits report review to community moderators and platform admins", () => {
    expect(canReviewCommunityReports("moderator")).toBe(true);
    expect(canReviewCommunityReports("admin")).toBe(true);
    expect(canReviewCommunityReports("organizer")).toBe(false);
  });
});
