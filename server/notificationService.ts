import { eq } from "drizzle-orm";
import { notificationDeliveryRecords, notificationOutbox, notifications } from "../drizzle/schema";
import { sendEmail } from "./emailService";

/**
 * In-app is the only enabled channel for this MVP. A future email adapter can
 * consume the same delivery shape only after opt-in preferences and a provider
 * contract are introduced.
 */
export type InAppDelivery = {
  userId: number;
  gameId?: number | null;
  type: "game_confirmed" | "waitlist_promoted" | "organizer_update";
  title: string;
  body: string;
};

export function confirmedGameDelivery(userId: number, gameId: number, gameTitle: string, state: "confirmed" | "waitlisted"): InAppDelivery {
  return {
    userId,
    gameId,
    type: "game_confirmed",
    title: state === "confirmed" ? "You’re confirmed" : "You’re on the waitlist",
    body: state === "confirmed" ? `Your place is held for ${gameTitle}.` : `You’re next in line if a place opens for ${gameTitle}.`,
  };
}

export function waitlistPromotionDelivery(userId: number, gameId: number, gameTitle: string): InAppDelivery {
  return { userId, gameId, type: "waitlist_promoted", title: "A place just opened", body: `You’ve moved from the waitlist to confirmed for ${gameTitle}.` };
}

export function organizerUpdateDelivery(userId: number, gameId: number, message: string): InAppDelivery {
  return { userId, gameId, type: "organizer_update", title: "Organizer update", body: message };
}

// Minimal structural type over the drizzle builders so tests can pass a
// stub without depending on drizzle generics (which are invariant here).
/* eslint-disable @typescript-eslint/no-explicit-any */
type InsertBuilder = { values: (values: any) => Promise<any>; where?: never };
type UpdateBuilder = { set: (values: any) => { where: (condition: any) => Promise<any> } };
type NotificationRepository = { insert: (table: any) => InsertBuilder; update?: (table: any) => UpdateBuilder; getEmailForUser?: (userId: number) => Promise<string | null> };
/* eslint-enable @typescript-eslint/no-explicit-any */

export type NotificationPreferenceSnapshot = { inAppEnabled: boolean; emailEnabled?: boolean; gameUpdatesEnabled: boolean; waitlistUpdatesEnabled: boolean };

export function shouldDeliverInApp(preferences: NotificationPreferenceSnapshot | undefined, type: InAppDelivery["type"]) {
  if (!preferences || !preferences.inAppEnabled) return false;
  if (type === "organizer_update") return preferences.gameUpdatesEnabled;
  return preferences.waitlistUpdatesEnabled;
}

/** Email mirrors the in-app gates plus its own master switch. */
export function shouldDeliverEmail(preferences: NotificationPreferenceSnapshot | undefined, type: InAppDelivery["type"]) {
  if (!preferences || !preferences.emailEnabled) return false;
  return shouldDeliverInApp({ ...preferences, inAppEnabled: true }, type);
}

function insertIdFrom(result: unknown) {
  if (Array.isArray(result) && result[0] && typeof result[0] === "object" && "insertId" in result[0]) return Number((result[0] as { insertId: number }).insertId);
  if (result && typeof result === "object" && "insertId" in result) return Number((result as { insertId: number }).insertId);
  return 0;
}

export async function persistInAppDeliveries(repository: NotificationRepository, deliveries: InAppDelivery | InAppDelivery[]) {
  const records = Array.isArray(deliveries) ? deliveries : [deliveries];
  const notificationIds: number[] = [];
  for (const delivery of records) {
    const result = await repository.insert(notifications).values(delivery);
    const notificationId = insertIdFrom(result);
    if (!notificationId) throw new Error("Could not persist the in-app notification.");
    notificationIds.push(notificationId);
    await repository.insert(notificationOutbox).values({ notificationId, state: "queued" });
    await repository.insert(notificationDeliveryRecords).values({ notificationId, channel: "in_app", state: "delivered", detail: "Rendered in the PicklePlay notification center.", deliveredAt: new Date() });
    await dispatchInAppOutbox(repository, notificationId);
  }
  return notificationIds;
}

export async function dispatchInAppOutbox(repository: NotificationRepository, notificationId: number) {
  if (!repository.update) return false;
  await repository.update(notificationOutbox).set({ state: "delivered", attempts: 1, lockedAt: new Date(), lastError: null }).where(eq(notificationOutbox.notificationId, notificationId));
  return true;
}

/**
 * Attempts the email channel for deliveries that already have an in-app
 * notification row. Each attempt is recorded as a channel-specific delivery
 * record (sent/failed/suppressed); the outbox row itself stays the in-app
 * dispatch's. Requires repository.getEmailForUser — call sites without a
 * user lookup simply never attempt email.
 */
export async function persistEmailDeliveries(
  repository: NotificationRepository,
  entries: Array<{ delivery: InAppDelivery; notificationId: number }>,
  preferencesByUser: Map<number, NotificationPreferenceSnapshot> = new Map(),
  emailSender: typeof sendEmail = sendEmail
) {
  if (!repository.getEmailForUser) return [];
  const results: Array<{ userId: number; notificationId: number; state: "sent" | "failed" | "suppressed" }> = [];
  for (const { delivery, notificationId } of entries) {
    const preferences = preferencesByUser.get(delivery.userId);
    if (!shouldDeliverEmail(preferences, delivery.type)) continue;
    const to = await repository.getEmailForUser(delivery.userId);
    if (!to) continue;
    const state = await emailSender(to, `${delivery.title} · PicklePlay`, `${delivery.body}${delivery.gameId ? `\n\nOpen PicklePlay to see the game thread.` : ""}\n\nYou are receiving this because you opted into email updates on PicklePlay.`);
    await repository.insert(notificationDeliveryRecords).values({
      notificationId,
      channel: "email",
      state,
      detail: state === "sent" ? `Delivered to ${to}.` : state === "suppressed" ? "Email is not configured on the server." : "The SMTP provider rejected the message.",
      deliveredAt: state === "sent" ? new Date() : null,
    });
    results.push({ userId: delivery.userId, notificationId, state });
  }
  return results;
}
