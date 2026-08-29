import { describe, expect, it } from "vitest";

describe("server runtime dependencies", () => {
  it("resolves middleware and email modules used during startup", async () => {
    await expect(import("helmet")).resolves.toBeDefined();
    await expect(import("nodemailer")).resolves.toBeDefined();
  });
});

