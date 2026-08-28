import { describe, expect, it } from "vitest";
import { gameSearchConditions } from "./communityService";
import { games } from "../drizzle/schema";

// Each condition is a drizzle SQL expression whose queryChunks embed the
// bound column objects; collecting their names shows which columns a
// condition touches without depending on SQL string formatting.
function conditionColumns(condition: unknown): string[] {
  const names: string[] = [];
  const chunks = (condition as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      const name = (chunk as { name?: string }).name;
      if (typeof name === "string") names.push(name);
    }
  }
  return names;
}

describe("game search conditions", () => {
  it("always restricts to published, public, upcoming games", () => {
    const conditions = gameSearchConditions({});
    expect(conditions).toHaveLength(3);
    const columns = conditions.flatMap(conditionColumns);
    expect(columns).toContain(games.status.name);
    expect(columns).toContain(games.visibility.name);
    expect(columns).toContain(games.endsAt.name);
  });

  it("adds exactly one text-match condition when a term is present", () => {
    expect(gameSearchConditions({})).toHaveLength(3);
    expect(gameSearchConditions({ q: "  doubles  " })).toHaveLength(4);
  });

  it("adds date, skill, and venue conditions when supplied", () => {
    const conditions = gameSearchConditions({ dateFrom: 1_000, dateTo: 2_000, skillBand: "3.0 · 4.0", venueId: 5 });
    expect(conditions).toHaveLength(7);
    const columns = conditions.flatMap(conditionColumns);
    expect(columns).toContain(games.startsAt.name);
    expect(columns).toContain(games.skillBand.name);
    expect(columns).toContain(games.venueId.name);
  });
});
