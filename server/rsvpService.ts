import { decideRsvpState } from "./communityPolicy";
import { confirmedGameDelivery, InAppDelivery, waitlistPromotionDelivery } from "./notificationService";
import { RSVP_CUTOFF_MS } from "../shared/const";

export type RsvpState = "confirmed" | "waitlisted";

export type StoredRsvp = { id: number; userId: number; state: RsvpState; idempotencyKey?: string | null };

export class IdempotencyConflictError extends Error {
  constructor() {
    super("This RSVP request key has already been used.");
    this.name = "IdempotencyConflictError";
  }
}

export type RsvpTransaction = {
  findExisting: (userId: number) => Promise<StoredRsvp | undefined>;
  findByIdempotencyKey?: (idempotencyKey: string) => Promise<StoredRsvp | undefined>;
  countConfirmed: () => Promise<number>;
  create: (userId: number, state: RsvpState, idempotencyKey?: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
  findEarliestWaitlisted: () => Promise<StoredRsvp | undefined>;
  promote: (id: number) => Promise<void>;
  notify: (delivery: InAppDelivery) => Promise<void>;
};

export async function applyRsvpAction(
  transaction: RsvpTransaction,
  input: { userId: number; gameId: number; gameTitle: string; capacity: number; action: "join" | "leave"; guestCount?: number; idempotencyKey?: string; startsAt?: number; rsvpDeadlineAt?: number; now?: number }
) {
  if ((input.guestCount ?? 0) !== 0) throw new Error("Guest RSVPs are not available in PicklePlay.");
  if (input.action === "join" && input.idempotencyKey && transaction.findByIdempotencyKey) {
    const replay = await transaction.findByIdempotencyKey(input.idempotencyKey);
    if (replay) {
      if (replay.userId !== input.userId) throw new Error("This RSVP request key has already been used.");
      return { state: replay.state, changed: false, promotedUserId: null };
    }
  }
  const existing = await transaction.findExisting(input.userId);

  if (input.action === "join") {
    const cutoff = input.rsvpDeadlineAt ?? (input.startsAt ? input.startsAt - RSVP_CUTOFF_MS : undefined);
    if (cutoff !== undefined && (input.now ?? Date.now()) >= cutoff) {
      throw new Error("RSVPs close two hours before the game begins.");
    }
    if (existing) return { state: existing.state, changed: false, promotedUserId: null };
    const state = decideRsvpState(input.capacity, await transaction.countConfirmed());
    try {
      await transaction.create(input.userId, state, input.idempotencyKey);
    } catch (error) {
      // Two concurrent joins with the same idempotency key can both pass the
      // replay lookup before either inserts; the loser hits the unique index
      // and should behave as the replay it is, not surface a raw DB error.
      if (input.idempotencyKey && error instanceof IdempotencyConflictError) {
        const replay = transaction.findByIdempotencyKey
          ? await transaction.findByIdempotencyKey(input.idempotencyKey)
          : undefined;
        if (replay) return { state: replay.state, changed: false, promotedUserId: null };
      }
      throw error;
    }
    await transaction.notify(confirmedGameDelivery(input.userId, input.gameId, input.gameTitle, state));
    return { state, changed: true, promotedUserId: null };
  }

  if (!existing) return { state: null, changed: false, promotedUserId: null };
  await transaction.remove(existing.id);
  if (existing.state !== "confirmed") return { state: null, changed: true, promotedUserId: null };

  const next = await transaction.findEarliestWaitlisted();
  if (!next) return { state: null, changed: true, promotedUserId: null };
  await transaction.promote(next.id);
  await transaction.notify(waitlistPromotionDelivery(next.userId, input.gameId, input.gameTitle));
  return { state: null, changed: true, promotedUserId: next.userId };
}
