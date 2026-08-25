import { desc, eq } from "drizzle-orm";
import { venueClaims, venueCorrections, venueSources, venueStaff, venues } from "../drizzle/schema";
import { getDb } from "./db";

type Actor = { id: number; role: "user" | "player" | "organizer" | "moderator" | "admin" };

function requireAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new Error("Platform administrator access is required.");
}

export async function submitVenueClaim(actor: Actor, venueId: number, note?: string) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const venue = await db.select({ id: venues.id }).from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!venue[0]) throw new Error("This venue is unavailable.");
  await db.insert(venueClaims).values({ venueId, claimantId: actor.id, note: note || null });
  return { submitted: true };
}

export async function submitVenueCorrection(actor: Actor, input: { venueId: number; field: string; proposedValue: string; reason?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(venueCorrections).values({ ...input, submittedBy: actor.id, reason: input.reason || null });
  return { submitted: true };
}

export async function listVenueReviews(actor: Actor) {
  requireAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  const [claims, corrections] = await Promise.all([
    db.select().from(venueClaims).orderBy(desc(venueClaims.createdAt)).limit(100),
    db.select().from(venueCorrections).orderBy(desc(venueCorrections.createdAt)).limit(100),
  ]);
  return { claims, corrections };
}

export async function reviewVenueClaim(actor: Actor, claimId: number, state: "reviewing" | "accepted" | "rejected") {
  requireAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(venueClaims).set({ state, reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(venueClaims.id, claimId));
  return { updated: true };
}

export async function reviewVenueCorrection(actor: Actor, correctionId: number, state: "reviewing" | "accepted" | "rejected") {
  requireAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.update(venueCorrections).set({ state, reviewedBy: actor.id, reviewedAt: new Date() }).where(eq(venueCorrections.id, correctionId));
  return { updated: true };
}

export async function addVenueStaff(actor: Actor, venueId: number, userId: number, role: "manager" | "editor") {
  requireAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(venueStaff).values({ venueId, userId, role }).onDuplicateKeyUpdate({ set: { role } });
  return { updated: true };
}

export async function addVenueSource(actor: Actor, venueId: number, sourceLabel: string, sourceUrl?: string) {
  requireAdmin(actor);
  const db = await getDb();
  if (!db) throw new Error("Community data is temporarily unavailable.");
  await db.insert(venueSources).values({ venueId, sourceLabel, sourceUrl: sourceUrl || null, verifiedAt: new Date() });
  return { added: true };
}
