import { decideRsvpState } from "./communityPolicy";
import { confirmedGameDelivery, InAppDelivery, waitlistPromotionDelivery } from "./notificationService";

export type RsvpState = "confirmed" | "waitlisted";

export type StoredRsvp = { id: number; userId: number; state: RsvpState };

export type RsvpTransaction = {
  findExisting: (userId: number) => Promise<StoredRsvp | undefined>;
  countConfirmed: () => Promise<number>;
  create: (userId: number, state: RsvpState) => Promise<void>;
  remove: (id: number) => Promise<void>;
  findEarliestWaitlisted: () => Promise<StoredRsvp | undefined>;
  promote: (id: number) => Promise<void>;
  notify: (delivery: InAppDelivery) => Promise<void>;
};

export async function applyRsvpAction(
  transaction: RsvpTransaction,
  input: { userId: number; gameId: number; gameTitle: string; capacity: number; action: "join" | "leave"; startsAt?: number; rsvpDeadlineAt?: number; now?: number }
) {
  const existing = await transaction.findExisting(input.userId);

  if (input.action === "join") {
    const cutoff = input.rsvpDeadlineAt ?? (input.startsAt ? input.startsAt - 2 * 60 * 60 * 1000 : undefined);
    if (cutoff !== undefined && (input.now ?? Date.now()) >= cutoff) {
      throw new Error("RSVPs close two hours before the game begins.");
    }
    if (existing) return { state: existing.state, changed: false, promotedUserId: null };
    const state = decideRsvpState(input.capacity, await transaction.countConfirmed());
    await transaction.create(input.userId, state);
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
