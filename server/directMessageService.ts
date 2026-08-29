import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { directMessages, playerProfiles, userBlocks, users } from "../drizzle/schema";
import { getDb } from "./db";

export const DIRECT_MESSAGE_MAX_LENGTH = 2000;

/** Pure policy: can sender deliver a direct message to recipient? */
export function canSendDirectMessage(input: { senderId: number; recipientId: number; recipientExists: boolean; blockedByRecipient: boolean }) {
  if (!input.recipientExists) return { allowed: false as const, reason: "This player is no longer available." };
  if (input.senderId === input.recipientId) return { allowed: false as const, reason: "You can’t message yourself." };
  if (input.blockedByRecipient) return { allowed: false as const, reason: "This player is not receiving your messages." };
  return { allowed: true as const };
}

export async function sendDirectMessage(senderId: number, recipientId: number, body: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Write a message before sending.");
  if (trimmed.length > DIRECT_MESSAGE_MAX_LENGTH) throw new Error(`Messages are limited to ${DIRECT_MESSAGE_MAX_LENGTH} characters.`);

  const recipient = (await db.select({ id: users.id }).from(users).where(eq(users.id, recipientId)).limit(1))[0];
  const block = (await db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, recipientId), eq(userBlocks.blockedUserId, senderId))).limit(1))[0];
  const decision = canSendDirectMessage({ senderId, recipientId, recipientExists: !!recipient, blockedByRecipient: !!block });
  if (!decision.allowed) throw new Error(decision.reason);

  await db.insert(directMessages).values({ senderId, recipientId, body: trimmed });
  return { recipientId };
}

export async function listConversations(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  // Latest message per counterpart, with unread counts. The users join
  // resolves the counterpart regardless of direction.
  const rows = await db
    .select({
      counterpartId: sql<number>`CASE WHEN ${directMessages.senderId} = ${userId} THEN ${directMessages.recipientId} ELSE ${directMessages.senderId} END`,
      lastBody: directMessages.body,
      lastAt: directMessages.createdAt,
      unread: sql<number>`SUM(CASE WHEN ${directMessages.recipientId} = ${userId} AND ${directMessages.readAt} IS NULL THEN 1 ELSE 0 END)`,
    })
    .from(directMessages)
    .where(or(eq(directMessages.senderId, userId), eq(directMessages.recipientId, userId)))
    .groupBy(sql`CASE WHEN ${directMessages.senderId} = ${userId} THEN ${directMessages.recipientId} ELSE ${directMessages.senderId} END`)
    .orderBy(desc(directMessages.createdAt))
    .limit(50);

  if (!rows.length) return [];
  const counterpartIds = rows.map(row => Number(row.counterpartId));
  const counterpartRows = await db
    .select({ id: users.id, displayName: playerProfiles.displayName, name: users.name })
    .from(users)
    .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
    .where(inArray(users.id, counterpartIds));
  const namesById = new Map(counterpartRows.map(row => [row.id, row.displayName || row.name || "PicklePlayer"]));
  return rows.map(row => ({ counterpartId: Number(row.counterpartId), counterpartName: namesById.get(Number(row.counterpartId)) ?? "PicklePlayer", lastBody: row.lastBody, lastAt: row.lastAt.getTime(), unread: Number(row.unread ?? 0) }));
}

export async function listDirectMessages(userId: number, counterpartId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const counterpart = (await db.select({ id: users.id, displayName: playerProfiles.displayName, name: users.name }).from(users).leftJoin(playerProfiles, eq(playerProfiles.userId, users.id)).where(eq(users.id, counterpartId)).limit(1))[0];
  if (!counterpart) throw new Error("This player is no longer available.");
  const rows = await db
    .select({ id: directMessages.id, senderId: directMessages.senderId, recipientId: directMessages.recipientId, body: directMessages.body, readAt: directMessages.readAt, createdAt: directMessages.createdAt })
    .from(directMessages)
    .where(or(and(eq(directMessages.senderId, userId), eq(directMessages.recipientId, counterpartId)), and(eq(directMessages.senderId, counterpartId), eq(directMessages.recipientId, userId))))
    .orderBy(asc(directMessages.createdAt))
    .limit(200);
  // Opening the thread marks the counterpart's messages as read.
  await db.update(directMessages).set({ readAt: new Date() }).where(and(eq(directMessages.senderId, counterpartId), eq(directMessages.recipientId, userId), sql`${directMessages.readAt} IS NULL`));
  return { counterpartName: counterpart.displayName || counterpart.name || "PicklePlayer", messages: rows.map(row => ({ ...row, createdAt: row.createdAt.getTime(), readAt: row.readAt?.getTime() ?? null })) };
}

export async function countUnreadMessages(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const rows = await db.select({ total: sql<number>`COUNT(*)` }).from(directMessages).where(and(eq(directMessages.recipientId, userId), sql`${directMessages.readAt} IS NULL`));
  return Number(rows[0]?.total ?? 0);
}
