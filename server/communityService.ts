import { and, asc, eq, inArray } from "drizzle-orm";
import { attendanceRecords, auditEvents, communityGroups, gameThreads, games, groupMemberships, playerProfiles, rsvps, savedGames, users } from "../drizzle/schema";
import { getDb } from "./db";
import { OrganizerActor } from "./organizerService";
import { canViewPrivateGroupMembers, membershipStateForVisibility } from "./communityAccess";

async function getGroupOwnerAccess(actor: OrganizerActor, groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const group = (await db.select().from(communityGroups).where(eq(communityGroups.id, groupId)).limit(1))[0];
  if (!group) throw new Error("This group is no longer available.");
  if (actor.role !== "admin" && group.ownerId !== actor.id) throw new Error("Only the group owner or platform admin can manage membership.");
  return group;
}

async function audit(actorId: number, type: string, subjectType: string, subjectId: number, metadata: Record<string, unknown>) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(auditEvents).values({ actorId, eventType: type, subjectType, subjectId, metadata: JSON.stringify(metadata) });
}

function makeGroupSlug(name: string) {
  const stem = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 68) || "local-group";
  return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCommunityGroup(actor: OrganizerActor, input: { name: string; description: string; neighborhood: string; visibility: "public" | "private" }) {
  if (actor.role === "user") throw new Error("Complete your player profile before creating a group.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const slug = makeGroupSlug(input.name);
  await db.transaction(async tx => {
    await tx.insert(communityGroups).values({ ...input, slug, ownerId: actor.id });
    const group = (await tx.select().from(communityGroups).where(eq(communityGroups.slug, slug)).limit(1))[0];
    if (!group) throw new Error("The group could not be created.");
    await tx.insert(groupMemberships).values({ groupId: group.id, userId: actor.id, role: "owner", state: "active", reviewedBy: actor.id, reviewedAt: new Date() });
    await tx.insert(auditEvents).values({ actorId: actor.id, eventType: "group_created", subjectType: "group", subjectId: group.id, metadata: JSON.stringify({ visibility: input.visibility }) });
  });
  const created = (await db.select().from(communityGroups).where(eq(communityGroups.slug, slug)).limit(1))[0];
  if (!created) throw new Error("The group could not be created.");
  return created;
}

export async function listCommunityMembers(currentUserId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const rows = await db.select({ userId: users.id, displayName: playerProfiles.displayName, city: playerProfiles.city, bio: playerProfiles.bio, skillBand: playerProfiles.skillBand, preferredFormats: playerProfiles.preferredFormats, visibility: playerProfiles.visibility, role: users.role })
    .from(playerProfiles).innerJoin(users, eq(playerProfiles.userId, users.id)).where(eq(playerProfiles.visibility, "community")).orderBy(asc(playerProfiles.displayName)).limit(50);
  return rows.filter(row => row.userId !== currentUserId);
}

export async function listVisibleGroupMembers(currentUserId: number, groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const group = (await db.select().from(communityGroups).where(eq(communityGroups.id, groupId)).limit(1))[0];
  if (!group) throw new Error("This group is no longer available.");
  const ownMembership = (await db.select({ state: groupMemberships.state }).from(groupMemberships).where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, currentUserId))).limit(1))[0];
  if (!canViewPrivateGroupMembers({ visibility: group.visibility, isOwner: group.ownerId === currentUserId, membershipState: ownMembership?.state })) throw new Error("Member details are available after group approval.");
  return db.select({ userId: users.id, displayName: playerProfiles.displayName, skillBand: playerProfiles.skillBand, role: groupMemberships.role, state: groupMemberships.state })
    .from(groupMemberships).innerJoin(users, eq(groupMemberships.userId, users.id)).leftJoin(playerProfiles, eq(playerProfiles.userId, users.id)).where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.state, "active"))).orderBy(asc(groupMemberships.joinedAt));
}

export async function requestGroupMembership(userId: number, groupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const group = (await db.select().from(communityGroups).where(eq(communityGroups.id, groupId)).limit(1))[0];
  if (!group) throw new Error("This group is no longer available.");
  const state = membershipStateForVisibility(group.visibility);
  await db.insert(groupMemberships).values({ groupId, userId, role: "member", state }).onDuplicateKeyUpdate({ set: { state, reviewedAt: state === "active" ? new Date() : null } });
  await audit(userId, state === "pending" ? "group_membership_requested" : "group_membership_joined", "group", groupId, { state });
  return { state };
}

export async function listGroupMembershipRequests(actor: OrganizerActor, groupId: number) {
  await getGroupOwnerAccess(actor, groupId);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return db.select({ id: groupMemberships.id, userId: groupMemberships.userId, joinedAt: groupMemberships.joinedAt, displayName: playerProfiles.displayName, name: users.name, skillBand: playerProfiles.skillBand })
    .from(groupMemberships).innerJoin(users, eq(groupMemberships.userId, users.id)).leftJoin(playerProfiles, eq(playerProfiles.userId, users.id)).where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.state, "pending"))).orderBy(asc(groupMemberships.joinedAt));
}

export async function reviewGroupMembership(actor: OrganizerActor, membershipId: number, decision: "active" | "denied", reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const membership = (await db.select().from(groupMemberships).where(eq(groupMemberships.id, membershipId)).limit(1))[0];
  if (!membership) throw new Error("This membership request is unavailable.");
  await getGroupOwnerAccess(actor, membership.groupId);
  if (membership.state !== "pending") throw new Error("Only pending membership requests can be reviewed.");
  await db.update(groupMemberships).set({ state: decision, reviewedBy: actor.id, reviewedAt: new Date(), decisionReason: reason || null }).where(eq(groupMemberships.id, membershipId));
  await audit(actor.id, "group_membership_reviewed", "group_membership", membershipId, { decision });
  return { reviewed: true };
}

export async function transferGroupOwnership(actor: OrganizerActor, groupId: number, successorUserId: number) {
  const group = await getGroupOwnerAccess(actor, groupId);
  if (successorUserId === group.ownerId) throw new Error("This player already owns the group.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const successor = (await db.select().from(groupMemberships).where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, successorUserId), eq(groupMemberships.state, "active"))).limit(1))[0];
  if (!successor) throw new Error("Ownership can only be transferred to an approved active member.");
  await db.transaction(async tx => {
    await tx.update(communityGroups).set({ ownerId: successorUserId, updatedAt: new Date() }).where(eq(communityGroups.id, groupId));
    await tx.update(groupMemberships).set({ role: "member" }).where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, actor.id)));
    await tx.update(groupMemberships).set({ role: "owner", reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(groupMemberships.id, successor.id));
    await tx.insert(auditEvents).values({ actorId: actor.id, eventType: "group_ownership_transferred", subjectType: "group", subjectId: groupId, metadata: JSON.stringify({ successorUserId }) });
  });
  return { transferred: true };
}

export async function recordAttendance(actor: OrganizerActor, rsvpId: number, status: "attended" | "no_show" | "late_cancel", correctionNote?: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const rsvp = (await db.select().from(rsvps).where(eq(rsvps.id, rsvpId)).limit(1))[0];
  if (!rsvp) throw new Error("This RSVP is unavailable.");
  const game = (await db.select().from(games).where(eq(games.id, rsvp.gameId)).limit(1))[0];
  if (!game || (actor.role !== "admin" && (actor.role !== "organizer" || game.organizerId !== actor.id))) throw new Error("Only the owning organizer or platform admin can record attendance.");
  await db.insert(attendanceRecords).values({ rsvpId, status, recordedBy: actor.id, checkInAt: status === "attended" ? new Date() : null, correctionNote: correctionNote || null }).onDuplicateKeyUpdate({ set: { status, recordedBy: actor.id, checkInAt: status === "attended" ? new Date() : null, correctionNote: correctionNote || null } });
  await audit(actor.id, "attendance_recorded", "rsvp", rsvpId, { status });
  return { recorded: true };
}

export async function saveGameForPlayer(userId: number, gameId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(savedGames).values({ userId, gameId }).onDuplicateKeyUpdate({ set: { userId } });
  return { saved: true };
}

export async function removeSavedGameForPlayer(userId: number, gameId: number) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.delete(savedGames).where(and(eq(savedGames.userId, userId), eq(savedGames.gameId, gameId)));
  return { saved: false };
}

export async function addGameThreadPost(userId: number, gameId: number, body: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const activeRsvp = (await db.select({ id: rsvps.id }).from(rsvps).where(and(eq(rsvps.userId, userId), eq(rsvps.gameId, gameId), inArray(rsvps.state, ["confirmed", "waitlisted"]))).limit(1))[0];
  const game = (await db.select().from(games).where(eq(games.id, gameId)).limit(1))[0];
  if (!game || (!activeRsvp && game.organizerId !== userId)) throw new Error("Only an active participant or the host can post in this game thread.");
  await db.insert(gameThreads).values({ gameId, authorId: userId, body });
  return { posted: true };
}
