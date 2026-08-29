import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function userContext(status: "active" | "suspended" | "banned", role: AuthenticatedUser["role"] = "player"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "status-test-user",
    email: "status@example.com",
    name: "Status Test User",
    loginMethod: "manus",
    role,
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("account status enforcement", () => {
  it("lets active players through to protected procedures", async () => {
    const caller = appRouter.createCaller(userContext("active"));
    const members = await caller.community.members();
    expect(Array.isArray(members)).toBe(true);
  });

  it("blocks suspended players from community procedures", async () => {
    const caller = appRouter.createCaller(userContext("suspended"));
    await expect(caller.community.members()).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("suspended") });
  });

  it("blocks banned players from community procedures", async () => {
    const caller = appRouter.createCaller(userContext("banned"));
    await expect(caller.community.members()).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("banned") });
  });

  it("blocks suspended administrators from administrator procedures", async () => {
    const caller = appRouter.createCaller(userContext("suspended", "admin"));
    await expect(caller.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
