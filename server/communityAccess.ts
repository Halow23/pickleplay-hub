export function membershipStateForVisibility(visibility: "public" | "private") {
  return visibility === "private" ? "pending" as const : "active" as const;
}

export function canViewPrivateGroupMembers(input: { visibility: "public" | "private"; isOwner: boolean; membershipState?: "pending" | "active" | "denied" | "removed" }) {
  return input.visibility === "public" || input.isOwner || input.membershipState === "active";
}

export function canBootstrapProjectAdmin(actorOpenId: string, ownerOpenId: string) {
  return Boolean(ownerOpenId) && actorOpenId === ownerOpenId;
}

export function assertGroupOwnerAccess(input: { actorId: number; actorRole: string; ownerId: number }) {
  if (input.actorRole !== "admin" && input.actorId !== input.ownerId) throw new Error("Only the group owner or platform admin can manage membership.");
}

export function assertActiveGroupMember(membership: { id: number } | undefined, message: string) {
  if (!membership) throw new Error(message);
  return membership;
}

export function assertValidGroupInvite(invite: { acceptedAt: Date | null; expiresAt: Date } | undefined, now = new Date()) {
  if (!invite || invite.acceptedAt || invite.expiresAt < now) throw new Error("This group invitation is invalid or has expired.");
  return invite;
}
