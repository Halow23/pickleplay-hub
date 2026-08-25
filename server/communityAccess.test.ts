import { describe, expect, it } from "vitest";
import { assertActiveGroupMember, assertGroupOwnerAccess, assertValidGroupInvite, canBootstrapProjectAdmin, canViewPrivateGroupMembers, membershipStateForVisibility } from "./communityAccess";

describe("community access policy", () => {
  it("creates a pending request for private groups and an active membership for public groups", () => {
    expect(membershipStateForVisibility("public")).toBe("active");
    expect(membershipStateForVisibility("private")).toBe("pending");
  });

  it("protects private member lists until the member is approved", () => {
    expect(canViewPrivateGroupMembers({ visibility: "private", isOwner: false, membershipState: "pending" })).toBe(false);
    expect(canViewPrivateGroupMembers({ visibility: "private", isOwner: false, membershipState: "active" })).toBe(true);
    expect(canViewPrivateGroupMembers({ visibility: "private", isOwner: true })).toBe(true);
  });

  it("only permits the configured project owner to bootstrap the first administrator", () => {
    expect(canBootstrapProjectAdmin("owner-1", "owner-1")).toBe(true);
    expect(canBootstrapProjectAdmin("member-2", "owner-1")).toBe(false);
  });

  it("rejects forbidden group-owner operations and inactive member targets", () => {
    expect(() => assertGroupOwnerAccess({ actorId: 5, actorRole: "organizer", ownerId: 9 })).toThrow("Only the group owner");
    expect(() => assertActiveGroupMember(undefined, "Ownership can only be transferred to an approved active member.")).toThrow("approved active member");
    expect(assertActiveGroupMember({ id: 7 }, "unused")).toEqual({ id: 7 });
  });

  it("rejects missing, consumed, and expired invitation records before membership writes", () => {
    const now = new Date("2026-08-25T00:00:00Z");
    expect(() => assertValidGroupInvite(undefined, now)).toThrow("invalid or has expired");
    expect(() => assertValidGroupInvite({ acceptedAt: now, expiresAt: new Date("2026-08-26T00:00:00Z") }, now)).toThrow("invalid or has expired");
    expect(() => assertValidGroupInvite({ acceptedAt: null, expiresAt: new Date("2026-08-24T00:00:00Z") }, now)).toThrow("invalid or has expired");
    expect(assertValidGroupInvite({ acceptedAt: null, expiresAt: new Date("2026-08-26T00:00:00Z") }, now)).toMatchObject({ acceptedAt: null });
  });
});
