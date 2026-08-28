import { describe, expect, it } from "vitest";
import { applyRsvpAction, IdempotencyConflictError, StoredRsvp } from "./rsvpService";

function createTransaction(initial: StoredRsvp[], capacity: number) {
  const rsvps = [...initial];
  const notifications: Array<{ type: string; userId: number }> = [];
  const createKeys: Array<string | undefined> = [];
  let id = rsvps.reduce((highest, rsvp) => Math.max(highest, rsvp.id), 0) + 1;
  return {
    capacity,
    rsvps,
    notifications,
    createKeys,
    transaction: {
      findExisting: async (userId: number) => rsvps.find(rsvp => rsvp.userId === userId),
      findByIdempotencyKey: async (idempotencyKey: string) => rsvps.find(rsvp => rsvp.idempotencyKey === idempotencyKey),
      countConfirmed: async () => rsvps.filter(rsvp => rsvp.state === "confirmed").length,
      create: async (userId: number, state: "confirmed" | "waitlisted", idempotencyKey?: string) => { createKeys.push(idempotencyKey); rsvps.push({ id: id++, userId, state, idempotencyKey }); },
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

  it("passes a caller idempotency key into the persisted RSVP create operation", async () => {
    const state = createTransaction([], 2);
    await applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join", idempotencyKey: "join-request-0001" });
    expect(state.createKeys).toEqual(["join-request-0001"]);
  });

  it("returns the original RSVP result when a join request is retried with the same key", async () => {
    const state = createTransaction([{ id: 1, userId: 11, state: "confirmed", idempotencyKey: "join-request-0001" }], 2);
    await expect(applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join", idempotencyKey: "join-request-0001" })).resolves.toMatchObject({ state: "confirmed", changed: false });
    expect(state.createKeys).toEqual([]);
  });

  it("rejects a new RSVP once the two-hour cutoff has passed", async () => {
    const state = createTransaction([], 2);
    await expect(applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join", startsAt: 10_000_000, now: 2_800_000 })).rejects.toThrow("RSVPs close two hours before the game begins.");
    expect(state.rsvps).toEqual([]);
    expect(state.notifications).toEqual([]);
  });

  it("rejects non-zero guest counts under the approved no-guest policy", async () => {
    const state = createTransaction([], 2);
    await expect(applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join", guestCount: 1 })).rejects.toThrow("Guest RSVPs are not available");
    expect(state.rsvps).toEqual([]);
  });

  it("promotes the earliest waitlisted player and persists the promotion notification after a confirmed leave", async () => {
    const state = createTransaction([{ id: 1, userId: 10, state: "confirmed" }, { id: 2, userId: 11, state: "waitlisted" }], 1);
    await expect(applyRsvpAction(state.transaction, { userId: 10, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "leave" })).resolves.toMatchObject({ promotedUserId: 11, changed: true });
    expect(state.rsvps).toEqual([{ id: 2, userId: 11, state: "confirmed" }]);
    expect(state.notifications).toMatchObject([{ userId: 11, type: "waitlist_promoted", title: "A place just opened" }]);
  });

  it("treats a duplicate-key insert as an idempotent replay instead of surfacing a raw database error", async () => {
    const state = createTransaction([], 2);
    // Simulate a concurrent request winning the insert: our create throws the
    // conflict error, but the row is already persisted under the same key.
    const originalCreate = state.transaction.create;
    state.transaction.create = async (userId, rsvpState, idempotencyKey) => {
      state.rsvps.push({ id: 99, userId, state: rsvpState, idempotencyKey });
      throw new IdempotencyConflictError();
    };
    void originalCreate;
    await expect(applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join", idempotencyKey: "join-request-raced" })).resolves.toMatchObject({ state: "confirmed", changed: false });
    expect(state.notifications).toEqual([]);
  });

  it("propagates unrelated insert failures instead of masking them as replays", async () => {
    const state = createTransaction([], 2);
    state.transaction.create = async () => {
      throw new Error("database unavailable");
    };
    await expect(applyRsvpAction(state.transaction, { userId: 11, gameId: 20, gameTitle: "Open play", capacity: state.capacity, action: "join", idempotencyKey: "join-request-other" })).rejects.toThrow("database unavailable");
  });
});
