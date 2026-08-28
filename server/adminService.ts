import { asc, eq } from "drizzle-orm";
import { auditEvents, playerProfiles, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { OrganizerActor } from "./organizerService";
import { canBootstrapProjectAdmin } from "./communityAccess";

export async function bootstrapProjectOwnerAdmin(actor: OrganizerActor & { openId: string }) {
  if (!canBootstrapProjectAdmin(actor.openId, ENV.ownerOpenId)) throw new Error("Only the project owner can bootstrap administrator access.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(users).set({ role: "admin" }).where(eq(users.id, actor.id));
  return { role: "admin" as const };
}

export async function listAdminUsers(actor: OrganizerActor) {
  if (actor.role !== "admin") throw new Error("Platform administrator access is required.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, displayName: playerProfiles.displayName, city: playerProfiles.city }).from(users).leftJoin(playerProfiles, eq(playerProfiles.userId, users.id)).orderBy(asc(users.name)).limit(100);
}

export async function updateUserRole(actor: OrganizerActor, userId: number, role: "player" | "organizer" | "moderator" | "admin") {
  if (actor.role !== "admin") throw new Error("Platform administrator access is required.");
  if (actor.id === userId && role !== "admin") throw new Error("You cannot remove your own administrator access.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(users).set({ role }).where(eq(users.id, userId));
  return { updated: true };
}

export async function setUserStatus(actor: OrganizerActor & { openId: string }, userId: number, status: "active" | "suspended" | "banned") {
  if (actor.role !== "admin") throw new Error("Platform administrator access is required.");
  if (actor.id === userId) throw new Error("You cannot change your own account status.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const target = (await db.select({ id: users.id, openId: users.openId }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!target) throw new Error("This account is no longer available.");
  // The owner account is auto-repromoted on login and cannot be sanctioned.
  if (target.openId === ENV.ownerOpenId) throw new Error("The project owner account status cannot be changed.");
  await db.transaction(async tx => {
    await tx.update(users).set({ status }).where(eq(users.id, userId));
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      eventType: "user_status_changed",
      subjectType: "user",
      subjectId: userId,
      metadata: JSON.stringify({ status }),
    });
  });
  return { updated: true };
}
