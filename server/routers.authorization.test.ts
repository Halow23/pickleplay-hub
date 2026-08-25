import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function anonymousContext(): TrpcContext {
  return { user: null, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("signed-in community and administrator procedures", () => {
  it("requires sign-in before listing community members", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.community.members()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires sign-in before creating a group", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.community.createGroup({ name: "Riverside Rally", description: "A welcoming local group for community pickleball.", neighborhood: "Riverside", visibility: "public" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires sign-in before accessing administrator procedures", async () => {
    const caller = appRouter.createCaller(anonymousContext());
    await expect(caller.admin.users()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
