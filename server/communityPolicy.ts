export type CommunityRole = "user" | "player" | "organizer" | "moderator" | "admin";

export function decideRsvpState(capacity: number, confirmedCount: number): "confirmed" | "waitlisted" {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error("A game must have at least one available place.");
  }

  return confirmedCount < capacity ? "confirmed" : "waitlisted";
}

export function chooseWaitlistPromotion<T>(waitlistedAttendees: readonly T[]): T | undefined {
  return waitlistedAttendees[0];
}

export function canManageGame(role: CommunityRole, userId: number, organizerId: number): boolean {
  return role === "admin" || (role === "organizer" && userId === organizerId);
}

export function canReviewCommunityReports(role: CommunityRole): boolean {
  return role === "moderator" || role === "admin";
}
