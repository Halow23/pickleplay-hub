import { and, asc, count, eq, inArray } from "drizzle-orm";
import { auditEvents, communityGroups, games, notifications, playerProfiles, rsvps, users, venues } from "../drizzle/schema";
import { getDb } from "./db";
import { organizerUpdateDelivery, persistInAppDeliveries } from "./notificationService";
import { assertOrganizerGameAccess, assertSafeCapacityChange, canCreateOrganizerGame } from "./organizerPolicy";

export type OrganizerActor = { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" };

export type GameInput = {
  venueId: number;
  groupId?: number | null;
  title: string;
  description: string;
  format: string;
  skillBand: string;
  capacity: number;
  visibility: "public" | "private";
  beginnerFriendly: boolean;
  attendanceNote: string;
  startsAt: Date;
  endsAt: Date;
  rsvpDeadlineAt?: Date | null;
};

function makeSlug(title: string) {
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 68) || "game";
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}

export function selectCreatedOrganizerGame<T extends { slug: string }>(rows: readonly T[], createdSlug: string): T {
  const created = rows.find(row => row.slug === createdSlug);
  if (!created) throw new Error("The game could not be created.");
  return created;
}

async function writeAudit(actorId: number, eventType: string, subjectType: string, subjectId: number, metadata: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(auditEvents).values({ actorId, eventType, subjectType, subjectId, metadata: JSON.stringify(metadata) });
}

async function getManagedGame(actor: OrganizerActor, gameId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const game = (await db.select().from(games).where(eq(games.id, gameId)).limit(1))[0];
  if (!game) throw new Error("This game is no longer available.");
  assertOrganizerGameAccess(actor.role, actor.id, game.organizerId);
  return game;
}

async function ensureOrganizerCanUseGroup(actor: OrganizerActor, groupId: number | null | undefined) {
  if (!groupId) return;
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const group = (await db.select().from(communityGroups).where(eq(communityGroups.id, groupId)).limit(1))[0];
  if (!group) throw new Error("The selected group is unavailable.");
  if (actor.role !== "admin" && group.ownerId !== actor.id) throw new Error("Only the group owner can create a group-restricted game.");
}

export async function createOrganizerGame(actor: OrganizerActor, input: GameInput, publish = false) {
  if (!canCreateOrganizerGame(actor.role)) throw new Error("Organizer access is required to create a game.");
  if (input.endsAt <= input.startsAt) throw new Error("The game must end after it starts.");
  assertSafeCapacityChange(0, input.capacity, 0);
  await ensureOrganizerCanUseGroup(actor, input.groupId);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const venue = (await db.select({ id: venues.id }).from(venues).where(eq(venues.id, input.venueId)).limit(1))[0];
  if (!venue) throw new Error("The selected venue is unavailable.");
  const now = new Date();
  const slug = makeSlug(input.title);
  await db.insert(games).values({
    ...input,
    groupId: input.groupId || null,
    slug,
    organizerId: actor.id,
    status: publish ? "published" : "draft",
    publishedAt: publish ? now : null,
    updatedBy: actor.id,
  });
  const created = selectCreatedOrganizerGame(await db.select().from(games).where(eq(games.slug, slug)).limit(1), slug);
  await writeAudit(actor.id, publish ? "game_published" : "game_created", "game", created.id, { status: created.status });
  return created;
}

export async function updateOrganizerGame(actor: OrganizerActor, gameId: number, input: GameInput) {
  const game = await getManagedGame(actor, gameId);
  if (game.status === "cancelled" || game.status === "archived") throw new Error("Cancelled or archived games cannot be edited.");
  if (input.endsAt <= input.startsAt) throw new Error("The game must end after it starts.");
  await ensureOrganizerCanUseGroup(actor, input.groupId);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const confirmed = Number((await db.select({ total: count(rsvps.id) }).from(rsvps).where(and(eq(rsvps.gameId, gameId), eq(rsvps.state, "confirmed"))))[0]?.total ?? 0);
  assertSafeCapacityChange(game.capacity, input.capacity, confirmed);
  await db.update(games).set({ ...input, groupId: input.groupId || null, updatedBy: actor.id, updatedAt: new Date() }).where(eq(games.id, gameId));
  await writeAudit(actor.id, "game_updated", "game", gameId, { capacity: input.capacity, startsAt: input.startsAt.toISOString() });
  return { updated: true };
}

export async function publishOrganizerGame(actor: OrganizerActor, gameId: number) {
  const game = await getManagedGame(actor, gameId);
  if (game.status !== "draft") throw new Error("Only draft games can be published.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(games).set({ status: "published", publishedAt: new Date(), updatedBy: actor.id }).where(eq(games.id, gameId));
  await writeAudit(actor.id, "game_published", "game", gameId, {});
  return { published: true };
}

export async function cancelOrganizerGame(actor: OrganizerActor, gameId: number, reason: string) {
  const game = await getManagedGame(actor, gameId);
  if (game.status === "cancelled") return { cancelled: false, recipientCount: 0 };
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const attendees = await db.select({ userId: rsvps.userId }).from(rsvps).where(and(eq(rsvps.gameId, gameId), inArray(rsvps.state, ["confirmed", "waitlisted"])));
  await db.transaction(async tx => {
    await tx.update(games).set({ status: "cancelled", cancellationReason: reason, cancelledAt: new Date(), updatedBy: actor.id }).where(eq(games.id, gameId));
    if (attendees.length) await persistInAppDeliveries(tx, attendees.map(attendee => organizerUpdateDelivery(attendee.userId, gameId, `Cancelled: ${game.title}. ${reason}`)));
  });
  await writeAudit(actor.id, "game_cancelled", "game", gameId, { reason, recipientCount: attendees.length });
  return { cancelled: true, recipientCount: attendees.length };
}

export async function archiveOrganizerGame(actor: OrganizerActor, gameId: number) {
  await getManagedGame(actor, gameId);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(games).set({ status: "archived", updatedBy: actor.id }).where(eq(games.id, gameId));
  await writeAudit(actor.id, "game_archived", "game", gameId, {});
  return { archived: true };
}

export async function getOrganizerRoster(actor: OrganizerActor, gameId: number) {
  await getManagedGame(actor, gameId);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return db.select({ rsvpId: rsvps.id, state: rsvps.state, createdAt: rsvps.createdAt, userId: users.id, name: users.name, displayName: playerProfiles.displayName, skillBand: playerProfiles.skillBand })
    .from(rsvps).innerJoin(users, eq(rsvps.userId, users.id)).leftJoin(playerProfiles, eq(playerProfiles.userId, users.id)).where(eq(rsvps.gameId, gameId)).orderBy(asc(rsvps.state), asc(rsvps.createdAt));
}

export async function listOrganizerGames(actor: OrganizerActor) {
  if (!canCreateOrganizerGame(actor.role)) throw new Error("Organizer access is required.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return db.select({ id: games.id, title: games.title, status: games.status, startsAt: games.startsAt, capacity: games.capacity, venueName: venues.name, visibility: games.visibility })
    .from(games).innerJoin(venues, eq(games.venueId, venues.id)).where(actor.role === "admin" ? undefined : eq(games.organizerId, actor.id)).orderBy(asc(games.startsAt));
}
