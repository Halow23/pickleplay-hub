import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("community data authenticity", () => {
  it("does not embed or invoke the removed placeholder community seed", () => {
    const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

    expect(dbSource).not.toContain("ensureCommunitySeedData");
    expect(dbSource).not.toContain("pickleplay-community-harbor");
    expect(dbSource).not.toContain("riverside-first-rally");
    expect(homeSource).not.toContain('game.venueNeighborhood === "Riverside"');
    expect(homeSource).toContain("No games have been posted yet");
    expect(homeSource).toContain("No groups yet");
    expect(homeSource).toContain("No venues yet");
  });
});

