import { asc, eq } from "drizzle-orm";
import { playerProfiles, users } from "../drizzle/schema";
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
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, displayName: playerProfiles.displayName, city: playerProfiles.city }).from(users).leftJoin(playerProfiles, eq(playerProfiles.userId, users.id)).orderBy(asc(users.name)).limit(100);
}

export async function updateUserRole(actor: OrganizerActor, userId: number, role: "player" | "organizer" | "moderator" | "admin") {
  if (actor.role !== "admin") throw new Error("Platform administrator access is required.");
  if (actor.id === userId && role !== "admin") throw new Error("You cannot remove your own administrator access.");
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(users).set({ role }).where(eq(users.id, userId));
  return { updated: true };
}
