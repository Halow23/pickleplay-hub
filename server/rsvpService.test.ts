import { describe, expect, it } from "vitest";
import { applyRsvpAction, StoredRsvp } from "./rsvpService";

function createTransaction(initial: StoredRsvp[], capacity: number) {
  const rsvps = [...initial];
  const notifications: Array<{ type: string; userId: number }> = [];
  let id = rsvps.reduce((highest, rsvp) => Math.max(highest, rsvp.id), 0) + 1;
  return {
    capacity,
    rsvps,
    notifications,
    transaction: {
      findExisting: async (userId: number) => rsvps.find(rsvp => rsvp.userId === userId),
      countConfirmed: async () => rsvps.filter(rsvp => rsvp.state === "confirmed").length,
      create: async (userId: number, state: "confirmed" | "waitlisted") => { rsvps.push({ id: id++, userId, state }); },
      remove: async (targetId: number) => { const index = rsvps.findIndex(rsvp => rsvp.id === targetId); if (index >= 0) rsvps.splice(index, 1); },
      findEarliestWaitlisted: async () => rsvps.find(rsvp => rsvp.state === "waitlisted"),
      promote: async (targetId: number) => { const target = rsvps.find(rsvp => rsvp.id === targetId); if (target) target.state = "confirmed"; },
      notify: async (delivery: { type: string; userId: number }) => { notifications.push(delivery); },
    },
  };
}

describe("persisted RSVP transaction behavior", () => {
  it("persists a confirmed RSVP and its in-app confirmation when capacity remains", async () => {
    const state = createTransaction([], 2);
    await expect(applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join" })).resolves.toMatchObject({ state: "confirmed", changed: true });
    expect(state.rsvps).toMatchObject([{ userId: 11, state: "confirmed" }]);
    expect(state.notifications).toMatchObject([{ userId: 11, type: "game_confirmed", title: "You’re confirmed" }]);
  });

  it("persists a waitlisted RSVP and its waitlist notification once capacity is full", async () => {
    const state = createTransaction([{ id: 1, userId: 10, state: "confirmed" }], 1);
    await expect(applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join" })).resolves.toMatchObject({ state: "waitlisted", changed: true });
    expect(state.rsvps).toMatchObject([{ userId: 10, state: "confirmed" }, { userId: 11, state: "waitlisted" }]);
    expect(state.notifications).toMatchObject([{ userId: 11, type: "game_confirmed", title: "You’re on the waitlist" }]);
  });

  it("promotes the earliest waitlisted player and persists the promotion notification after a confirmed leave", async () => {
    const state = createTransaction([{ id: 1, userId: 10, state: "confirmed" }, { id: 2, userId: 11, state: "waitlisted" }], 1);
    await expect(applyRsvpAction(state.transaction, { userId: 10, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "leave" })).resolves.toMatchObject({ promotedUserId: 11, changed: true });
    expect(state.rsvps).toEqual([{ id: 2, userId: 11, state: "confirmed" }]);
    expect(state.notifications).toMatchObject([{ userId: 11, type: "waitlist_promoted", title: "A place just opened" }]);
  });
});
