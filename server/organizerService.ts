import { and, asc, count, eq, inArray } from "drizzle-orm";
import { attendanceRecords, auditEvents, communityGroups, games, notificationPreferences, notifications, playerProfiles, rsvps, users, venues } from "../drizzle/schema";
import { getDb } from "./db";
import { organizerUpdateDelivery, persistEmailDeliveries, persistInAppDeliveries } from "./notificationService";
import { assertOrganizerGameAccess, assertSafeCapacityChange, canCreateOrganizerGame } from "./organizerPolicy";
import { RSVP_CUTOFF_MS } from "../shared/const";

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
  recurrence?: "none" | "weekly" | "biweekly";
};

export type GameRecurrence = NonNullable<GameInput["recurrence"]>;

/** How many occurrences a new series materializes up front. */
export const SERIES_INITIAL_OCCURRENCES = 8;

function recurrenceStepMs(recurrence: GameRecurrence) {
  const days = recurrence === "weekly" ? 7 : 14;
  return days * 24 * 60 * 60 * 1000;
}

/** Computes the start/end/deadline timestamps for the nth occurrence of a series (pure, exported for tests). */
export function seriesOccurrenceTimes(input: { startsAt: Date; endsAt: Date; rsvpDeadlineAt?: Date | null }, recurrence: GameRecurrence, occurrence: number) {
  if (occurrence === 0) return { startsAt: input.startsAt, endsAt: input.endsAt, rsvpDeadlineAt: input.rsvpDeadlineAt ?? null };
  const step = recurrenceStepMs(recurrence);
  return {
    startsAt: new Date(input.startsAt.getTime() + step * occurrence),
    endsAt: new Date(input.endsAt.getTime() + step * occurrence),
    rsvpDeadlineAt: input.rsvpDeadlineAt ? new Date(input.rsvpDeadlineAt.getTime() + step * occurrence) : null,
  };
}

function makeSlug(title: string) {
  const stem = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 68) || "game";
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}

export function selectCreatedOrganizerGame<T extends { slug: string }>(rows: readonly T[], createdSlug: string): T {
  const created = rows.find(row => row.slug === createdSlug);
  if (!created) throw new Error("The game could not be created.");
  return created;
}

export function resolveRsvpDeadline(startsAt: Date, requestedDeadline?: Date | null) {
  const deadline = requestedDeadline || new Date(startsAt.getTime() - RSVP_CUTOFF_MS);
  if (deadline.getTime() >= startsAt.getTime()) throw new Error("The RSVP deadline must be before the game begins.");
  return deadline;
}

export function assertCancellationReason(reason: string) {
  if (reason.trim().length < 3) throw new Error("A cancellation reason is required.");
  return reason.trim();
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
  const rsvpDeadlineAt = resolveRsvpDeadline(input.startsAt, input.rsvpDeadlineAt);
  const recurrence: GameRecurrence = input.recurrence ?? "none";
  const slug = makeSlug(input.title);
  await db.insert(games).values({
    ...input,
    recurrence,
    rsvpDeadlineAt,
    groupId: input.groupId || null,
    slug,
    organizerId: actor.id,
    status: publish ? "published" : "draft",
    publishedAt: publish ? now : null,
    updatedBy: actor.id,
  });
  const created = selectCreatedOrganizerGame(await db.select().from(games).where(eq(games.slug, slug)).limit(1), slug);
  await writeAudit(actor.id, publish ? "game_published" : "game_created", "game", created.id, { status: created.status });

  if (recurrence !== "none") {
    // Later occurrences start as drafts linked to the root; the organizer
    // publishes each session (or the whole series via extend/publish).
    const values = Array.from({ length: SERIES_INITIAL_OCCURRENCES - 1 }, (_, index) => {
      const times = seriesOccurrenceTimes(input, recurrence, index + 1);
      return {
        ...input,
        recurrence,
        ...times,
        groupId: input.groupId || null,
        slug: makeSlug(input.title),
        organizerId: actor.id,
        parentGameId: created.id,
        status: "draft" as const,
        publishedAt: null,
        updatedBy: actor.id,
      };
    });
    await db.insert(games).values(values);
    await writeAudit(actor.id, "game_series_created", "game", created.id, { recurrence, occurrences: SERIES_INITIAL_OCCURRENCES });
  }
  return created;
}

/** Appends the next batch of occurrences to an existing series the actor owns. */
export async function extendOrganizerSeries(actor: OrganizerActor, rootGameId: number) {
  const root = await getManagedGame(actor, rootGameId);
  if (!root.parentGameId && root.recurrence === "none") throw new Error("This game is not part of a recurring series.");
  const seriesRootId = root.parentGameId ?? root.id;
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const seriesRoot = seriesRootId === root.id ? root : (await db.select().from(games).where(eq(games.id, seriesRootId)).limit(1))[0];
  if (!seriesRoot) throw new Error("This game is no longer available.");
  if (seriesRoot.recurrence === "none") throw new Error("This game is not part of a recurring series.");
  const members = await db.select({ startsAt: games.startsAt }).from(games).where(eq(games.parentGameId, seriesRootId)).orderBy(asc(games.startsAt));
  const latest = members.length ? members[members.length - 1].startsAt : seriesRoot.startsAt;
  const times = seriesOccurrenceTimes({ startsAt: latest, endsAt: new Date(latest.getTime() + (seriesRoot.endsAt.getTime() - seriesRoot.startsAt.getTime())), rsvpDeadlineAt: null }, seriesRoot.recurrence, 1);
  await db.insert(games).values({
    venueId: seriesRoot.venueId,
    groupId: seriesRoot.groupId,
    title: seriesRoot.title,
    description: seriesRoot.description,
    format: seriesRoot.format,
    skillBand: seriesRoot.skillBand,
    capacity: seriesRoot.capacity,
    visibility: seriesRoot.visibility,
    beginnerFriendly: seriesRoot.beginnerFriendly,
    attendanceNote: seriesRoot.attendanceNote,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    rsvpDeadlineAt: new Date(times.startsAt.getTime() - RSVP_CUTOFF_MS),
    recurrence: seriesRoot.recurrence,
    slug: makeSlug(seriesRoot.title),
    organizerId: seriesRoot.organizerId,
    parentGameId: seriesRootId,
    status: "draft",
    publishedAt: null,
    updatedBy: actor.id,
  });
  await writeAudit(actor.id, "game_series_extended", "game", seriesRootId, { startsAt: times.startsAt.toISOString() });
  return { startsAt: times.startsAt.getTime() };
}

export async function updateOrganizerGame(actor: OrganizerActor, gameId: number, input: GameInput) {
  const game = await getManagedGame(actor, gameId);
  if (game.status === "cancelled" || game.status === "archived") throw new Error("Cancelled or archived games cannot be edited.");
  if (input.endsAt <= input.startsAt) throw new Error("The game must end after it starts.");
  await ensureOrganizerCanUseGroup(actor, input.groupId);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const rsvpDeadlineAt = resolveRsvpDeadline(input.startsAt, input.rsvpDeadlineAt);
  // Count and update inside one transaction on a locked game row so a RSVP
  // landing between the capacity check and the update cannot overshoot.
  await db.transaction(async tx => {
    await tx.select({ id: games.id }).from(games).where(eq(games.id, gameId)).limit(1).for("update");
    const confirmed = Number((await tx.select({ total: count(rsvps.id) }).from(rsvps).where(and(eq(rsvps.gameId, gameId), eq(rsvps.state, "confirmed"))))[0]?.total ?? 0);
    assertSafeCapacityChange(game.capacity, input.capacity, confirmed);
    await tx.update(games).set({ ...input, rsvpDeadlineAt, groupId: input.groupId || null, updatedBy: actor.id, updatedAt: new Date() }).where(eq(games.id, gameId));
  });
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
  const cancellationReason = assertCancellationReason(reason);
  const game = await getManagedGame(actor, gameId);
  if (game.status === "cancelled") return { cancelled: false, recipientCount: 0 };
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const attendees = await db.select({ userId: rsvps.userId }).from(rsvps).where(and(eq(rsvps.gameId, gameId), inArray(rsvps.state, ["confirmed", "waitlisted"])));
  await db.transaction(async tx => {
    await tx.update(games).set({ status: "cancelled", cancellationReason, cancelledAt: new Date(), updatedBy: actor.id }).where(eq(games.id, gameId));
    if (attendees.length) {
      const deliveries = attendees.map(attendee => organizerUpdateDelivery(attendee.userId, gameId, `Cancelled: ${game.title}. ${cancellationReason}`));
      const notificationIds = await persistInAppDeliveries(tx, deliveries);
      // Email only for members who opted in; in-app stays as-is for cancellations.
      const preferenceRows = await tx.select({ userId: notificationPreferences.userId, emailEnabled: notificationPreferences.emailEnabled, gameUpdatesEnabled: notificationPreferences.gameUpdatesEnabled, waitlistUpdatesEnabled: notificationPreferences.waitlistUpdatesEnabled }).from(notificationPreferences).where(inArray(notificationPreferences.userId, attendees.map(attendee => attendee.userId)));
      const emailPreferences = new Map(preferenceRows.map(preference => [preference.userId, { inAppEnabled: true, ...preference }]));
      await persistEmailDeliveries({ insert: tx.insert.bind(tx), getEmailForUser: async userId => (await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0]?.email ?? null }, deliveries.map((delivery, index) => ({ delivery, notificationId: notificationIds[index] })), emailPreferences);
    }
  });
  await writeAudit(actor.id, "game_cancelled", "game", gameId, { reason: cancellationReason, recipientCount: attendees.length });
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
  return db.select({ rsvpId: rsvps.id, state: rsvps.state, createdAt: rsvps.createdAt, userId: users.id, name: users.name, displayName: playerProfiles.displayName, skillBand: playerProfiles.skillBand, attendanceStatus: attendanceRecords.status, checkInAt: attendanceRecords.checkInAt, correctionNote: attendanceRecords.correctionNote })
    .from(rsvps).innerJoin(users, eq(rsvps.userId, users.id)).leftJoin(playerProfiles, eq(playerProfiles.userId, users.id)).leftJoin(attendanceRecords, eq(attendanceRecords.rsvpId, rsvps.id)).where(eq(rsvps.gameId, gameId)).orderBy(asc(rsvps.state), asc(rsvps.createdAt));
}

export async function listOrganizerGames(actor: OrganizerActor) {
  if (!canCreateOrganizerGame(actor.role)) throw new Error("Organizer access is required.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return db.select({ id: games.id, title: games.title, description: games.description, status: games.status, startsAt: games.startsAt, endsAt: games.endsAt, rsvpDeadlineAt: games.rsvpDeadlineAt, capacity: games.capacity, venueId: games.venueId, venueName: venues.name, groupId: games.groupId, format: games.format, skillBand: games.skillBand, visibility: games.visibility, beginnerFriendly: games.beginnerFriendly, attendanceNote: games.attendanceNote, recurrence: games.recurrence, parentGameId: games.parentGameId })
    .from(games).innerJoin(venues, eq(games.venueId, venues.id)).where(actor.role === "admin" ? undefined : eq(games.organizerId, actor.id)).orderBy(asc(games.startsAt)).limit(50);
}
