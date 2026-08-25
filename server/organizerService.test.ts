import { describe, expect, it } from "vitest";
import { selectCreatedOrganizerGame } from "./organizerService";

describe("organizer game creation lookup", () => {
  it("selects the exact newly inserted slug when an organizer has older games", () => {
    const olderGame = { id: 4, slug: "weekly-open-play-older" };
    const createdGame = { id: 9, slug: "weekly-open-play-new" };

    expect(selectCreatedOrganizerGame([olderGame, createdGame], "weekly-open-play-new")).toEqual(createdGame);
    expect(selectCreatedOrganizerGame([createdGame], "weekly-open-play-new").id).toBe(9);
  });
});
