import { describe, expect, it } from "vitest";
import { assertCancellationReason, resolveRsvpDeadline, selectCreatedOrganizerGame } from "./organizerService";

describe("organizer game creation lookup", () => {
  it("selects the exact newly inserted slug when an organizer has older games", () => {
    const olderGame = { id: 4, slug: "weekly-open-play-older" };
    const createdGame = { id: 9, slug: "weekly-open-play-new" };

    expect(selectCreatedOrganizerGame([olderGame, createdGame], "weekly-open-play-new")).toEqual(createdGame);
    expect(selectCreatedOrganizerGame([createdGame], "weekly-open-play-new").id).toBe(9);
  });

  it("defaults RSVP close to two hours before the game and rejects deadlines at or after the start", () => {
    const startsAt = new Date("2026-08-30T18:00:00.000Z");
    expect(resolveRsvpDeadline(startsAt)).toEqual(new Date("2026-08-30T16:00:00.000Z"));
    expect(() => resolveRsvpDeadline(startsAt, startsAt)).toThrow("must be before");
  });

  it("requires organizers to document a meaningful cancellation reason", () => {
    expect(() => assertCancellationReason("  ")).toThrow("cancellation reason is required");
    expect(assertCancellationReason("  Courts closed for maintenance ")).toBe("Courts closed for maintenance");
  });
});
