import { describe, expect, it } from "vitest";
import { canBootstrapProjectAdmin, canViewPrivateGroupMembers, membershipStateForVisibility } from "./communityAccess";

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
});
