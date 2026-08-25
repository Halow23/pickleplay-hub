export function membershipStateForVisibility(visibility: "public" | "private") {
  return visibility === "private" ? "pending" as const : "active" as const;
}

export function canViewPrivateGroupMembers(input: { visibility: "public" | "private"; isOwner: boolean; membershipState?: "pending" | "active" | "denied" | "removed" }) {
  return input.visibility === "public" || input.isOwner || input.membershipState === "active";
}

export function canBootstrapProjectAdmin(actorOpenId: string, ownerOpenId: string) {
  return Boolean(ownerOpenId) && actorOpenId === ownerOpenId;
}
