import { CommunityRole, canManageGame } from "./communityPolicy";

export function canCreateOrganizerGame(role: CommunityRole): boolean {
  return role === "organizer" || role === "admin";
}

export function assertOrganizerGameAccess(role: CommunityRole, actorId: number, organizerId: number) {
  if (!canManageGame(role, actorId, organizerId)) throw new Error("Only the owning organizer or platform admin can manage this game.");
}

export function assertSafeCapacityChange(currentCapacity: number, requestedCapacity: number, confirmedCount: number) {
  if (!Number.isInteger(requestedCapacity) || requestedCapacity < 1) throw new Error("Game capacity must be at least one.");
  if (requestedCapacity < confirmedCount) throw new Error(`Capacity cannot be reduced below the ${confirmedCount} confirmed players.`);
  return requestedCapacity !== currentCapacity;
}
