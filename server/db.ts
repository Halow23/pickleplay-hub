import { and, asc, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
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
  userBlocks,
  users,
  venues,
  venueSources,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { confirmedGameDelivery, organizerUpdateDelivery, persistInAppDeliveries, shouldDeliverInApp, waitlistPromotionDelivery } from "./notificationService";
import { assertOpenReportTransition, listReportsForReviewer, setReportReviewStatus } from "./moderationService";
import { applyRsvpAction } from "./rsvpService";

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

function dateInDays(daysFromNow: number, hour: number, durationHours: number) {
  const startsAt = new Date();
  startsAt.setMinutes(0, 0, 0);
  startsAt.setHours(hour, 0, 0, 0);
  startsAt.setDate(startsAt.getDate() + daysFromNow);
  const endsAt = new Date(startsAt);
  endsAt.setHours(endsAt.getHours() + durationHours);
  return { startsAt, endsAt };
}

async function ensureCommunitySeedData() {
  const db = await getDb();
  if (!db) return;
  const existingVenue = await db.select({ id: venues.id }).from(venues).limit(1);
  if (existingVenue.length) return;

  await db.transaction(async tx => {
    const alreadySeeded = await tx.select({ id: venues.id }).from(venues).limit(1);
    if (alreadySeeded.length) return;

    await tx.insert(users).values([
      { openId: "pickleplay-community-harbor", name: "Harbor Community Hosts", loginMethod: "system", role: "organizer" },
      { openId: "pickleplay-community-willow", name: "Willow Park Organizers", loginMethod: "system", role: "organizer" },
    ]);
    const organizers = await tx.select().from(users).where(inArray(users.openId, ["pickleplay-community-harbor", "pickleplay-community-willow"]));
    const harborHost = organizers.find(account => account.openId === "pickleplay-community-harbor");
    const willowHost = organizers.find(account => account.openId === "pickleplay-community-willow");
    if (!harborHost || !willowHost) throw new Error("Could not establish community organizers.");

    await tx.insert(playerProfiles).values([
      { userId: harborHost.id, displayName: "Harbor Community Hosts", city: "Your local area", skillBand: "Community host", ratingProvenance: "none", visibility: "community", preferredFormats: "Open play, doubles" },
      { userId: willowHost.id, displayName: "Willow Park Organizers", city: "Your local area", skillBand: "Community host", ratingProvenance: "none", visibility: "community", preferredFormats: "Beginner play, doubles" },
    ]);

    await tx.insert(venues).values([
      { slug: "willow-park-courts", name: "Willow Park Courts", neighborhood: "Riverside", city: "Your local area", addressLabel: "Riverside recreation area", courtCount: 6, indoor: false, lighting: true, visibility: "public", accessibilityNote: "Step-free route from the main entrance." },
      { slug: "harbor-pavilion", name: "Harbor Pavilion", neighborhood: "Old Town", city: "Your local area", addressLabel: "Old Town community pavilion", courtCount: 4, indoor: true, lighting: true, visibility: "public", accessibilityNote: "Indoor courts with seating nearby." },
      { slug: "cedar-green", name: "Cedar Green Courts", neighborhood: "Northside", city: "Your local area", addressLabel: "Northside greenway courts", courtCount: 3, indoor: false, lighting: false, visibility: "private", accessibilityNote: "Access shared with approved community members." },
    ]);
    const seededVenues = await tx.select().from(venues).where(inArray(venues.slug, ["willow-park-courts", "harbor-pavilion", "cedar-green"]));
    const willowVenue = seededVenues.find(venue => venue.slug === "willow-park-courts");
    const harborVenue = seededVenues.find(venue => venue.slug === "harbor-pavilion");
    const cedarVenue = seededVenues.find(venue => venue.slug === "cedar-green");
    if (!willowVenue || !harborVenue || !cedarVenue) throw new Error("Could not establish community venues.");

    await tx.insert(communityGroups).values([
      { slug: "riverside-rally", ownerId: willowHost.id, name: "Riverside Rally", description: "A welcoming local group for open play, doubles partners, and gentle first-game introductions.", neighborhood: "Riverside", visibility: "public" },
      { slug: "harbor-doubles", ownerId: harborHost.id, name: "Harbor Doubles Circle", description: "A neighborhood doubles group with clear RSVP expectations and a respectful, social pace.", neighborhood: "Old Town", visibility: "public" },
      { slug: "northside-early-play", ownerId: willowHost.id, name: "Northside Early Play", description: "A member-led early-session group that coordinates recurring play with organizers.", neighborhood: "Northside", visibility: "private" },
    ]);
    const seededGroups = await tx.select().from(communityGroups).where(inArray(communityGroups.slug, ["riverside-rally", "harbor-doubles", "northside-early-play"]));
    const riversideGroup = seededGroups.find(group => group.slug === "riverside-rally");
    const harborGroup = seededGroups.find(group => group.slug === "harbor-doubles");
    const northsideGroup = seededGroups.find(group => group.slug === "northside-early-play");
    if (!riversideGroup || !harborGroup || !northsideGroup) throw new Error("Could not establish community groups.");

    await tx.insert(groupMemberships).values([
      { groupId: riversideGroup.id, userId: willowHost.id, role: "owner" },
      { groupId: harborGroup.id, userId: harborHost.id, role: "owner" },
      { groupId: northsideGroup.id, userId: willowHost.id, role: "owner" },
    ]);

    const beginnerGame = dateInDays(1, 18, 2);
    const socialGame = dateInDays(2, 10, 2);
    const memberGame = dateInDays(3, 7, 2);
    await tx.insert(games).values([
      { slug: "riverside-first-rally", organizerId: willowHost.id, venueId: willowVenue.id, groupId: riversideGroup.id, title: "First Rally: easygoing open play", description: "A newcomer-friendly evening with a host available to help with introductions and court rotation.", format: "Open play", skillBand: "New to pickleball · 2.5", capacity: 12, visibility: "public", beginnerFriendly: true, attendanceNote: "Please arrive 10 minutes early so the group can start together.", startsAt: beginnerGame.startsAt, endsAt: beginnerGame.endsAt },
      { slug: "harbor-social-doubles", organizerId: harborHost.id, venueId: harborVenue.id, groupId: harborGroup.id, title: "Harbor Social Doubles", description: "A relaxed doubles session for players who enjoy steady games and meeting local partners.", format: "Doubles", skillBand: "2.5 · 3.5", capacity: 8, visibility: "public", beginnerFriendly: true, attendanceNote: "Bring water and be ready for rotating partners.", startsAt: socialGame.startsAt, endsAt: socialGame.endsAt },
      { slug: "northside-early-games", organizerId: willowHost.id, venueId: cedarVenue.id, groupId: northsideGroup.id, title: "Northside early games", description: "A smaller, member-coordinated morning session with a consistent group rhythm.", format: "Doubles", skillBand: "3.0 · 4.0", capacity: 6, visibility: "private", beginnerFriendly: false, attendanceNote: "Member check-in is required before court assignments.", startsAt: memberGame.startsAt, endsAt: memberGame.endsAt },
    ]);
    const seededGames = await tx.select().from(games).where(inArray(games.slug, ["riverside-first-rally", "harbor-social-doubles", "northside-early-games"]));
    const firstRally = seededGames.find(game => game.slug === "riverside-first-rally");
    const socialDoubles = seededGames.find(game => game.slug === "harbor-social-doubles");
    const earlyGames = seededGames.find(game => game.slug === "northside-early-games");
    if (!firstRally || !socialDoubles || !earlyGames) throw new Error("Could not establish community games.");

    await tx.insert(gamePosts).values([
      { gameId: firstRally.id, groupId: riversideGroup.id, authorId: willowHost.id, headline: "A gentle first session", body: "This session is designed to make first games feel less intimidating. Ask the host for a quick rules refresher or an introduction to a partner.", attendanceExpectations: "Respect the court rotation and let the host know if your plans change." },
      { gameId: socialDoubles.id, groupId: harborGroup.id, authorId: harborHost.id, headline: "Play, meet, repeat", body: "We will rotate partners and keep the pace social. Please use the RSVP so everyone knows the session is viable.", attendanceExpectations: "Check in with the host before joining a court." },
      { gameId: earlyGames.id, groupId: northsideGroup.id, authorId: willowHost.id, headline: "Member session details", body: "Court assignments are shared with confirmed members before play begins.", attendanceExpectations: "This activity is limited to approved group members." },
    ]);
  });
}

export async function getOrCreatePlayerProfile(userId: number, accountName?: string | null) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(playerProfiles).values({ userId, displayName: accountName?.trim() || "New PicklePlayer" });
  const created = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).limit(1);
  return created[0];
}

export async function getCommunityDashboard(currentUser?: { id: number; name?: string | null; role?: string } | null) {
  await ensureCommunitySeedData();
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
      beginnerFriendly: games.beginnerFriendly,
      attendanceNote: games.attendanceNote,
      startsAt: games.startsAt,
      endsAt: games.endsAt,
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
    .orderBy(asc(games.startsAt));

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
  let userNotifications: Array<{ id: number; title: string; body: string; type: "game_confirmed" | "waitlist_promoted" | "organizer_update"; readAt: number | null; createdAt: number }> = [];
  let attendanceHistory: Array<{ gameId: number; title: string; status: "attended" | "no_show" | "late_cancel"; recordedAt: number; correctionNote: string | null }> = [];

  if (currentUser) {
    currentProfile = await getOrCreatePlayerProfile(currentUser.id, currentUser.name);
    const userRsvps = await db.select().from(rsvps).where(eq(rsvps.userId, currentUser.id));
    rsvpByGame = new Map(userRsvps.map(rsvp => [rsvp.gameId, rsvp.state]));
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
      confirmedCount: confirmedByGame.get(game.id) ?? 0,
      userRsvpState: rsvpByGame.get(game.id) ?? null,
      canAccess: game.visibility === "public" || currentUser?.id === game.organizerId || (game.groupId ? memberships.has(game.groupId) : false),
    })),
    venues: venueRows.map(venue => ({ ...venue, sources: venueSourcesByVenue.get(venue.id) || [] })),
    groups: groupRows.map(group => ({ ...group, isMember: memberships.has(group.id) })),
    notifications: userNotifications,
    attendanceHistory,
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
      create: async (requestedUserId, state, requestKey) => { await tx.insert(rsvps).values({ gameId, userId: requestedUserId, state, guestCount: 0, idempotencyKey: requestKey || null }); },
      remove: async rsvpId => { await tx.delete(rsvps).where(eq(rsvps.id, rsvpId)); },
      findEarliestWaitlisted: async () => (await tx.select().from(rsvps).where(and(eq(rsvps.gameId, gameId), eq(rsvps.state, "waitlisted"))).orderBy(asc(rsvps.createdAt), asc(rsvps.id)).limit(1).for("update"))[0],
      promote: async rsvpId => { await tx.update(rsvps).set({ state: "confirmed", updatedAt: new Date() }).where(eq(rsvps.id, rsvpId)); },
      notify: async delivery => {
        const preference = (await tx.select({ inAppEnabled: notificationPreferences.inAppEnabled, gameUpdatesEnabled: notificationPreferences.gameUpdatesEnabled, waitlistUpdatesEnabled: notificationPreferences.waitlistUpdatesEnabled }).from(notificationPreferences).where(eq(notificationPreferences.userId, delivery.userId)).limit(1))[0];
        if (shouldDeliverInApp(preference || { inAppEnabled: true, gameUpdatesEnabled: true, waitlistUpdatesEnabled: true }, delivery.type)) await persistInAppDeliveries(tx, delivery);
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

export async function reviewCommunityReport(role: "user" | "player" | "organizer" | "moderator" | "admin", reportId: number, status: "reviewing" | "closed") {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return setReportReviewStatus({ listReports: async () => [], setReportStatus: async (targetId, targetStatus) => { await db.update(reports).set({ status: targetStatus }).where(eq(reports.id, targetId)); } }, role, reportId, status);
}

export async function assignCommunityReport(actor: { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" }, reportId: number) {
  if (actor.role !== "moderator" && actor.role !== "admin") throw new Error("Moderator access is required to assign reports.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.transaction(async tx => {
    const report = (await tx.select({ id: reports.id, status: reports.status }).from(reports).where(eq(reports.id, reportId)).limit(1).for("update"))[0];
    if (!report) throw new Error("This report is no longer available.");
    assertOpenReportTransition(report.status, "assign");
    await tx.update(reports).set({ assignedTo: actor.id, status: "reviewing" }).where(eq(reports.id, reportId));
    await tx.insert(auditEvents).values({ actorId: actor.id, eventType: "report_assigned", subjectType: "report", subjectId: reportId, metadata: JSON.stringify({ assignedTo: actor.id }) });
  });
  return { updated: true };
}

export async function resolveCommunityReport(actor: { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" }, input: { reportId: number; resolutionReason: string; resolutionNote?: string; sanction: "none" | "warning" | "suspension" | "ban" }) {
  if (actor.role !== "moderator" && actor.role !== "admin") throw new Error("Moderator access is required to resolve reports.");
  if (input.sanction === "ban" && actor.role !== "admin") throw new Error("Only platform administrators can apply a ban.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.transaction(async tx => {
    const report = (await tx.select({ id: reports.id, status: reports.status }).from(reports).where(eq(reports.id, input.reportId)).limit(1).for("update"))[0];
    if (!report) throw new Error("This report is no longer available.");
    assertOpenReportTransition(report.status, "resolve");
    await tx.update(reports).set({ status: "closed", assignedTo: actor.id, resolutionReason: input.resolutionReason, resolutionNote: input.resolutionNote || null, sanction: input.sanction, resolvedAt: new Date() }).where(eq(reports.id, input.reportId));
    await tx.insert(auditEvents).values({ actorId: actor.id, eventType: "report_resolved", subjectType: "report", subjectId: input.reportId, metadata: JSON.stringify({ resolutionReason: input.resolutionReason, sanction: input.sanction }) });
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
    await persistInAppDeliveries(db, attendees.map(attendee => organizerUpdateDelivery(attendee.userId, gameId, message)));
  }
  return { recipientCount: attendees.length };
}

export async function markNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { updated: true };
}
