import { eq } from "drizzle-orm";
import { notificationPreferences } from "../drizzle/schema";
import { getDb } from "./db";

export type NotificationPreferenceInput = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  gameUpdatesEnabled: boolean;
  waitlistUpdatesEnabled: boolean;
};

const defaults: NotificationPreferenceInput = {
  inAppEnabled: true,
  emailEnabled: false,
  gameUpdatesEnabled: true,
  waitlistUpdatesEnabled: true,
};

export async function getNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const existing = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  // Upsert rather than plain insert: two concurrent first requests would
  // otherwise both insert and the loser would fail the unique constraint.
  await db
    .insert(notificationPreferences)
    .values({ userId, ...defaults })
    .onDuplicateKeyUpdate({ set: { userId } });
  return (await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1))[0]!;
}

export async function updateNotificationPreferences(userId: number, input: NotificationPreferenceInput) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(notificationPreferences).values({ userId, ...input }).onDuplicateKeyUpdate({ set: { ...input, updatedAt: new Date() } });
  return getNotificationPreferences(userId);
}
