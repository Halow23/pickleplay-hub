import { describe, expect, it } from "vitest";
import { assertOrganizerGameAccess, assertSafeCapacityChange, canCreateOrganizerGame } from "./organizerPolicy";

describe("organizer game policy", () => {
  it("limits creation to organizers and admins", () => {
    expect(canCreateOrganizerGame("organizer")).toBe(true);
    expect(canCreateOrganizerGame("admin")).toBe(true);
    expect(canCreateOrganizerGame("player")).toBe(false);
  });

  it("requires ownership unless the actor is an admin", () => {
    expect(() => assertOrganizerGameAccess("organizer", 4, 5)).toThrow("Only the owning organizer");
    expect(() => assertOrganizerGameAccess("organizer", 4, 4)).not.toThrow();
    expect(() => assertOrganizerGameAccess("admin", 4, 5)).not.toThrow();
  });

  it("does not allow a capacity reduction that would displace confirmed players", () => {
    expect(() => assertSafeCapacityChange(12, 5, 6)).toThrow("cannot be reduced");
    expect(assertSafeCapacityChange(12, 8, 6)).toBe(true);
  });
});
