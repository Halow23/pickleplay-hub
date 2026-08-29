import { and, asc, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import {
  attendanceRecords,
  auditEvents,
  communityGroups,
  games,
  gamePosts,
  groupMemberships,
  InsertUser,
  notificationPreferences,
  notifications,
  playerProfiles,
  reports,
  rsvps,
  savedGames,
  userBlocks,
  users,
  venues,
  venueSources,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { confirmedGameDelivery, organizerUpdateDelivery, persistEmailDeliveries, persistInAppDeliveries, shouldDeliverInApp, waitlistPromotionDelivery } from "./notificationService";
import { assertReportAvailableForTransition, assertOpenReportTransition, listReportsForReviewer, prepareReportAssignment, prepareReportResolution, sanctionUserStatus, setReportReviewStatus } from "./moderationService";
import { applyRsvpAction, IdempotencyConflictError } from "./rsvpService";

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ER_DUP_ENTRY";
}

/** Wraps a drizzle db/transaction with the user-email lookup the email channel needs. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function withEmailLookup(executor: { select: any; insert: any; update: any }) {
  return {
    insert: executor.insert.bind(executor),
    update: executor.update.bind(executor),
    getEmailForUser: async (userId: number) => (await executor.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0]?.email ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: new Date() };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getOrCreatePlayerProfile(userId: number, accountName?: string | null) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  // Upsert rather than plain insert: two concurrent first requests would
  // otherwise both insert and the loser would fail the unique constraint.
  await db
    .insert(playerProfiles)
    .values({ userId, displayName: accountName?.trim() || "New PicklePlayer", calendarFeedToken: nanoid(32) })
    .onDuplicateKeyUpdate({ set: { userId } });
  const created = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).limit(1);
  return created[0];
}

/** Returns the user's calendar feed token, minting one lazily so existing profiles get a feed too. */
export async function getOrCreateCalendarFeedToken(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const profile = (await db.select({ calendarFeedToken: playerProfiles.calendarFeedToken }).from(playerProfiles).where(eq(playerProfiles.userId, userId)).limit(1))[0];
  if (profile?.calendarFeedToken) return profile.calendarFeedToken;
  // Retry once on a (vanishingly unlikely) nanoid collision.
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = nanoid(32);
    try {
      await db.update(playerProfiles).set({ calendarFeedToken: token }).where(and(eq(playerProfiles.userId, userId), isNull(playerProfiles.calendarFeedToken)));
      return token;
    } catch {
      // Collision on the unique index — fall through and retry.
    }
  }
  throw new Error("Could not assign a calendar feed token. Please try again.");
}

/** Lists the confirmed/waitlisted upcoming games for a calendar feed token, or undefined for an unknown token. */
export async function listCalendarFeedGames(token: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const profile = (await db.select({ userId: playerProfiles.userId }).from(playerProfiles).where(eq(playerProfiles.calendarFeedToken, token)).limit(1))[0];
  if (!profile) return undefined;
  return db
    .select({
      id: games.id,
      title: games.title,
      description: games.description,
      startsAt: games.startsAt,
      endsAt: games.endsAt,
      venueName: venues.name,
    })
    .from(rsvps)
    .innerJoin(games, eq(rsvps.gameId, games.id))
    .innerJoin(venues, eq(games.venueId, venues.id))
    .where(and(eq(rsvps.userId, profile.userId), inArray(rsvps.state, ["confirmed", "waitlisted"]), gte(games.endsAt, new Date())))
    .orderBy(asc(games.startsAt))
    .limit(100);
}

export async function getCommunityDashboard(currentUser?: { id: number; name?: string | null; role?: string } | null) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");

  const now = new Date();
  const gameRows = await db
    .select({
      id: games.id,
      title: games.title,
      description: games.description,
      format: games.format,
      skillBand: games.skillBand,
      capacity: games.capacity,
      visibility: games.visibility,
      status: games.status,
      beginnerFriendly: games.beginnerFriendly,
      attendanceNote: games.attendanceNote,
      startsAt: games.startsAt,
      endsAt: games.endsAt,
      rsvpDeadlineAt: games.rsvpDeadlineAt,
      cancellationReason: games.cancellationReason,
      venueName: venues.name,
      venueNeighborhood: venues.neighborhood,
      venueIndoor: venues.indoor,
      venueCourtCount: venues.courtCount,
      groupId: communityGroups.id,
      groupName: communityGroups.name,
      organizerName: users.name,
      organizerId: games.organizerId,
      postHeadline: gamePosts.headline,
      postBody: gamePosts.body,
    })
    .from(games)
    .innerJoin(venues, eq(games.venueId, venues.id))
    .innerJoin(users, eq(games.organizerId, users.id))
    .leftJoin(communityGroups, eq(games.groupId, communityGroups.id))
    .leftJoin(gamePosts, eq(gamePosts.gameId, games.id))
    .where(gte(games.endsAt, now))
    .orderBy(asc(games.startsAt))
    .limit(60);

  const confirmedCounts = await db
    .select({ gameId: rsvps.gameId, total: count(rsvps.id) })
    .from(rsvps)
    .where(eq(rsvps.state, "confirmed"))
    .groupBy(rsvps.gameId);
  const confirmedByGame = new Map(confirmedCounts.map(row => [row.gameId, Number(row.total)]));

  const groupRows = await db
    .select({
      id: communityGroups.id,
      name: communityGroups.name,
      description: communityGroups.description,
      neighborhood: communityGroups.neighborhood,
      visibility: communityGroups.visibility,
      ownerId: communityGroups.ownerId,
      ownerName: users.name,
    })
    .from(communityGroups)
    .innerJoin(users, eq(communityGroups.ownerId, users.id))
    .orderBy(asc(communityGroups.name));

  const venueRows = await db.select().from(venues).where(eq(venues.visibility, "public")).orderBy(asc(venues.name));
  const venueSourceRows = await db.select({ venueId: venueSources.venueId, sourceLabel: venueSources.sourceLabel, sourceUrl: venueSources.sourceUrl, verifiedAt: venueSources.verifiedAt }).from(venueSources).orderBy(desc(venueSources.verifiedAt));
  const venueSourcesByVenue = new Map<number, Array<{ sourceLabel: string; sourceUrl: string | null; verifiedAt: number }>>();
  for (const source of venueSourceRows) {
    const current = venueSourcesByVenue.get(source.venueId) || [];
    current.push({ sourceLabel: source.sourceLabel, sourceUrl: source.sourceUrl, verifiedAt: source.verifiedAt?.getTime() ?? 0 });
    venueSourcesByVenue.set(source.venueId, current);
  }

  let currentProfile = undefined;
  let rsvpByGame = new Map<number, "confirmed" | "waitlisted">();
  let memberships = new Set<number>();
  let blockedHostIds = new Set<number>();
  let savedGameIds: number[] = [];
  let userNotifications: Array<{ id: number; title: string; body: string; type: "game_confirmed" | "waitlist_promoted" | "organizer_update"; readAt: number | null; createdAt: number }> = [];
  let attendanceHistory: Array<{ gameId: number; title: string; status: "attended" | "no_show" | "late_cancel"; recordedAt: number; correctionNote: string | null }> = [];

  if (currentUser) {
    currentProfile = await getOrCreatePlayerProfile(currentUser.id, currentUser.name);
    const userRsvps = await db.select().from(rsvps).where(eq(rsvps.userId, currentUser.id));
    rsvpByGame = new Map(userRsvps.map(rsvp => [rsvp.gameId, rsvp.state]));
    savedGameIds = (await db.select({ gameId: savedGames.gameId }).from(savedGames).where(eq(savedGames.userId, currentUser.id))).map(saved => saved.gameId);
    const userMemberships = await db.select({ groupId: groupMemberships.groupId }).from(groupMemberships).where(and(eq(groupMemberships.userId, currentUser.id), eq(groupMemberships.state, "active")));
    memberships = new Set(userMemberships.map(membership => membership.groupId));
    const blocks = await db.select({ blockedUserId: userBlocks.blockedUserId }).from(userBlocks).where(eq(userBlocks.blockerId, currentUser.id));
    blockedHostIds = new Set(blocks.map(block => block.blockedUserId));
    const rows = await db.select().from(notifications).where(eq(notifications.userId, currentUser.id)).orderBy(desc(notifications.createdAt)).limit(8);
    userNotifications = rows.map(notification => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      type: notification.type,
      readAt: notification.readAt ? notification.readAt.getTime() : null,
      createdAt: notification.createdAt.getTime(),
    }));
    const attendanceRows = await db.select({ gameId: games.id, title: games.title, status: attendanceRecords.status, recordedAt: attendanceRecords.updatedAt, correctionNote: attendanceRecords.correctionNote })
      .from(attendanceRecords)
      .innerJoin(rsvps, eq(attendanceRecords.rsvpId, rsvps.id))
      .innerJoin(games, eq(rsvps.gameId, games.id))
      .where(eq(rsvps.userId, currentUser.id))
      .orderBy(desc(attendanceRecords.updatedAt))
      .limit(12);
    attendanceHistory = attendanceRows.map(row => ({ ...row, recordedAt: row.recordedAt.getTime() }));
  }

  return {
    profile: currentProfile ? { ...currentProfile, createdAt: currentProfile.createdAt.getTime(), updatedAt: currentProfile.updatedAt.getTime() } : null,
    currentRole: currentUser?.role ?? null,
    games: gameRows.filter(game => !blockedHostIds.has(game.organizerId)).map(game => ({
      ...game,
      organizerName: game.organizerName ?? "Community host",
      startsAt: game.startsAt.getTime(),
      endsAt: game.endsAt.getTime(),
      rsvpDeadlineAt: game.rsvpDeadlineAt?.getTime() ?? null,
      confirmedCount: confirmedByGame.get(game.id) ?? 0,
      userRsvpState: rsvpByGame.get(game.id) ?? null,
      canAccess: game.visibility === "public" || currentUser?.id === game.organizerId || (game.groupId ? memberships.has(game.groupId) : false),
    })),
    venues: venueRows.map(venue => ({ ...venue, sources: venueSourcesByVenue.get(venue.id) || [] })),
    groups: groupRows.map(group => ({ ...group, isMember: memberships.has(group.id) })),
    notifications: userNotifications,
    attendanceHistory,
    savedGameIds,
  };
}

export async function respondToGame(userId: number, gameId: number, action: "join" | "leave", idempotencyKey?: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");

  return db.transaction(async tx => {
    const gameRows = await tx.select().from(games).where(eq(games.id, gameId)).limit(1).for("update");
    const game = gameRows[0];
    if (!game) throw new Error("This game is no longer available.");

    if (game.visibility === "private" && game.groupId) {
      const membership = await tx.select({ id: groupMemberships.id }).from(groupMemberships).where(and(eq(groupMemberships.groupId, game.groupId), eq(groupMemberships.userId, userId), eq(groupMemberships.state, "active"))).limit(1);
      if (!membership[0] && game.organizerId !== userId) throw new Error("This member session is available after group approval.");
    }

    return applyRsvpAction({
      findExisting: async requestedUserId => (await tx.select().from(rsvps).where(and(eq(rsvps.gameId, gameId), eq(rsvps.userId, requestedUserId))).limit(1))[0],
      findByIdempotencyKey: async requestKey => (await tx.select().from(rsvps).where(eq(rsvps.idempotencyKey, requestKey)).limit(1))[0],
      countConfirmed: async () => Number((await tx.select({ total: count(rsvps.id) }).from(rsvps).where(and(eq(rsvps.gameId, gameId), eq(rsvps.state, "confirmed"))))[0]?.total ?? 0),
      create: async (requestedUserId, state, requestKey) => {
        try {
          await tx.insert(rsvps).values({ gameId, userId: requestedUserId, state, guestCount: 0, idempotencyKey: requestKey || null });
        } catch (error) {
          // ER_DUP_ENTRY (1062) on the idempotency unique index means a
          // concurrent request with the same key already inserted.
          if (requestKey && isDuplicateKeyError(error)) throw new IdempotencyConflictError();
          throw error;
        }
      },
      remove: async rsvpId => { await tx.delete(rsvps).where(eq(rsvps.id, rsvpId)); },
      findEarliestWaitlisted: async () => (await tx.select().from(rsvps).where(and(eq(rsvps.gameId, gameId), eq(rsvps.state, "waitlisted"))).orderBy(asc(rsvps.createdAt), asc(rsvps.id)).limit(1).for("update"))[0],
      promote: async rsvpId => { await tx.update(rsvps).set({ state: "confirmed", updatedAt: new Date() }).where(eq(rsvps.id, rsvpId)); },
      notify: async delivery => {
        const preference = (await tx.select({ inAppEnabled: notificationPreferences.inAppEnabled, emailEnabled: notificationPreferences.emailEnabled, gameUpdatesEnabled: notificationPreferences.gameUpdatesEnabled, waitlistUpdatesEnabled: notificationPreferences.waitlistUpdatesEnabled }).from(notificationPreferences).where(eq(notificationPreferences.userId, delivery.userId)).limit(1))[0];
        const resolved = preference || { inAppEnabled: true, emailEnabled: false, gameUpdatesEnabled: true, waitlistUpdatesEnabled: true };
        if (!shouldDeliverInApp(resolved, delivery.type)) return;
        const [notificationId] = await persistInAppDeliveries(withEmailLookup(tx), delivery);
        await persistEmailDeliveries(withEmailLookup(tx), [{ delivery, notificationId }], new Map([[delivery.userId, resolved]]));
      },
    }, { userId, gameId, gameTitle: game.title, capacity: game.capacity, action, idempotencyKey, startsAt: game.startsAt.getTime(), rsvpDeadlineAt: game.rsvpDeadlineAt?.getTime() });
  });
}

export async function joinCommunityGroup(userId: number, groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const group = await db.select().from(communityGroups).where(eq(communityGroups.id, groupId)).limit(1);
  if (!group[0]) throw new Error("This group is no longer available.");
  if (group[0].visibility === "private") throw new Error("This group uses organizer approval before members join.");
  await db.insert(groupMemberships).values({ groupId, userId, role: "member" }).onDuplicateKeyUpdate({ set: { role: "member" } });
  return { joined: true };
}

export async function updatePlayerProfile(userId: number, input: { displayName: string; city: string; bio?: string; skillBand: string; ratingProvenance: "none" | "self_described" | "linked_provider"; visibility: "community" | "private"; preferredFormats: string }) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await getOrCreatePlayerProfile(userId, input.displayName);
  await db.update(playerProfiles).set({ ...input, bio: input.bio || null, updatedAt: new Date() }).where(eq(playerProfiles.userId, userId));
  return { updated: true };
}

export async function createCommunityReport(userId: number, input: { subjectType: "profile" | "group" | "game" | "game_post"; subjectId: number; reason: string; detail?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(reports).values({ reporterId: userId, ...input, detail: input.detail || null });
  return { received: true };
}

export async function blockCommunityUser(userId: number, blockedUserId: number, reason?: string) {
  if (userId === blockedUserId) throw new Error("You can’t block your own profile.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(userBlocks).values({ blockerId: userId, blockedUserId, reason: reason || null }).onDuplicateKeyUpdate({ set: { reason: reason || null } });
  return { blocked: true };
}

export async function getModerationReports(role: "user" | "player" | "organizer" | "moderator" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return listReportsForReviewer({ listReports: () => db.select().from(reports).orderBy(desc(reports.createdAt)).limit(50), setReportStatus: async () => undefined }, role);
}

export async function reviewCommunityReport(actor: { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" }, reportId: number, status: "reviewing" | "closed") {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return db.transaction(async tx => setReportReviewStatus({
    findReport: async targetId => (await tx.select({ status: reports.status }).from(reports).where(eq(reports.id, targetId)).limit(1).for("update"))[0],
    setReportStatus: async (targetId, targetStatus) => { await tx.update(reports).set({ status: targetStatus }).where(eq(reports.id, targetId)); },
    writeAudit: async audit => { await tx.insert(auditEvents).values(audit); },
  }, actor, reportId, status));
}

export async function assignCommunityReport(actor: { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" }, reportId: number) {
  const workflow = prepareReportAssignment(actor, reportId);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.transaction(async tx => {
    const report = (await tx.select({ id: reports.id, status: reports.status }).from(reports).where(eq(reports.id, reportId)).limit(1).for("update"))[0];
    assertReportAvailableForTransition(report, "assign");
    await tx.update(reports).set(workflow.update).where(eq(reports.id, reportId));
    await tx.insert(auditEvents).values(workflow.audit);
  });
  return { updated: true };
}

export async function resolveCommunityReport(actor: { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" }, input: { reportId: number; resolutionReason: string; resolutionNote?: string; sanction: "none" | "warning" | "suspension" | "ban"; subjectUserId?: number | null }) {
  const workflow = prepareReportResolution(actor, input);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.transaction(async tx => {
    const report = (await tx.select({ id: reports.id, status: reports.status }).from(reports).where(eq(reports.id, input.reportId)).limit(1).for("update"))[0];
    assertReportAvailableForTransition(report, "resolve");
    await tx.update(reports).set(workflow.update).where(eq(reports.id, input.reportId));
    await tx.insert(auditEvents).values(workflow.audit);
    // A suspension or ban must actually take effect on the account, not just
    // be recorded on the report.
    const userStatus = sanctionUserStatus(input.sanction);
    if (userStatus && workflow.update.subjectUserId) {
      await tx.update(users).set({ status: userStatus }).where(eq(users.id, workflow.update.subjectUserId));
    }
  });
  return { updated: true };
}

export async function getModerationAudit(role: "user" | "player" | "organizer" | "moderator" | "admin") {
  if (role !== "moderator" && role !== "admin") throw new Error("Moderator access is required to view report history.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return db.select().from(auditEvents).where(eq(auditEvents.subjectType, "report")).orderBy(desc(auditEvents.createdAt)).limit(100);
}

export async function sendGameUpdate(user: { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" }, gameId: number, message: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const game = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  if (!game[0]) throw new Error("This game is no longer available.");
  if (user.role !== "admin" && (user.role !== "organizer" || game[0].organizerId !== user.id)) throw new Error("Only the game organizer can send this update.");

  const attendees = await db.select({ userId: rsvps.userId }).from(rsvps).where(and(eq(rsvps.gameId, gameId), inArray(rsvps.state, ["confirmed", "waitlisted"])));
  if (attendees.length) {
    const preferenceRows = await db.select({ userId: notificationPreferences.userId, inAppEnabled: notificationPreferences.inAppEnabled, emailEnabled: notificationPreferences.emailEnabled, gameUpdatesEnabled: notificationPreferences.gameUpdatesEnabled, waitlistUpdatesEnabled: notificationPreferences.waitlistUpdatesEnabled }).from(notificationPreferences).where(inArray(notificationPreferences.userId, attendees.map(attendee => attendee.userId)));
    const preferencesByUser = new Map(preferenceRows.map(preference => [preference.userId, preference]));
    const fallbackPreferences = { inAppEnabled: true, emailEnabled: false, gameUpdatesEnabled: true, waitlistUpdatesEnabled: true };
    const deliveries = attendees.map(attendee => organizerUpdateDelivery(attendee.userId, gameId, message)).filter(delivery => shouldDeliverInApp(preferencesByUser.get(delivery.userId) || fallbackPreferences, delivery.type));
    if (deliveries.length) {
      const notificationIds = await persistInAppDeliveries(withEmailLookup(db), deliveries);
      await persistEmailDeliveries(withEmailLookup(db), deliveries.map((delivery, index) => ({ delivery, notificationId: notificationIds[index] })), preferencesByUser);
    }
    return { recipientCount: deliveries.length };
  }
  return { recipientCount: 0 };
}

export async function markNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { updated: true };
}
