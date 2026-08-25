import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const communityMocks = vi.hoisted(() => ({ createGroup: vi.fn(), members: vi.fn() }));
vi.mock("./communityService", () => ({
  addGameThreadPost: vi.fn(),
  createCommunityGroup: communityMocks.createGroup,
  listCommunityMembers: communityMocks.members,
  listGroupMembershipRequests: vi.fn(),
  listVisibleGroupMembers: vi.fn(),
  recordAttendance: vi.fn(),
  removeSavedGameForPlayer: vi.fn(),
  requestGroupMembership: vi.fn(),
  reviewGroupMembership: vi.fn(),
  saveGameForPlayer: vi.fn(),
}));
vi.mock("./adminService", () => ({
  bootstrapProjectOwnerAdmin: vi.fn(async (actor: { openId: string }) => {
    if (actor.openId !== "owner-open-id") throw new Error("Only the project owner can bootstrap administrator access.");
    return { role: "admin" as const };
  }),
  listAdminUsers: vi.fn(async (actor: { role: string }) => {
    if (actor.role !== "admin") throw new Error("Platform administrator access is required.");
    return [];
  }),
  updateUserRole: vi.fn(async (actor: { role: string }) => {
    if (actor.role !== "admin") throw new Error("Platform administrator access is required.");
    return { updated: true };
  }),
}));

import { appRouter } from "./routers";

function context(role: "player" | "admin", openId = "member-open-id"): TrpcContext {
  return { user: { id: 7, openId, name: "Happy Player", email: "happy@example.com", loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("signed-in route behavior", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("creates groups and returns community-visible members for a signed-in player", async () => {
    communityMocks.createGroup.mockResolvedValue({ id: 18, name: "Riverside Rally" });
    communityMocks.members.mockResolvedValue([{ userId: 3, displayName: "Taylor" }]);
    const caller = appRouter.createCaller(context("player"));
    await expect(caller.community.createGroup({ name: "Riverside Rally", description: "A welcoming local group for community pickleball.", neighborhood: "Riverside", visibility: "public" })).resolves.toMatchObject({ id: 18 });
    await expect(caller.community.members()).resolves.toEqual([{ userId: 3, displayName: "Taylor" }]);
  });

  it("permits only the project owner to bootstrap administrator access", async () => {
    await expect(appRouter.createCaller(context("player", "owner-open-id")).admin.bootstrap()).resolves.toEqual({ role: "admin" });
    await expect(appRouter.createCaller(context("player")).admin.bootstrap()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("permits administrator role updates and rejects a player attempt", async () => {
    await expect(appRouter.createCaller(context("admin")).admin.updateUserRole({ userId: 9, role: "organizer" })).resolves.toEqual({ updated: true });
    await expect(appRouter.createCaller(context("player")).admin.updateUserRole({ userId: 9, role: "organizer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
