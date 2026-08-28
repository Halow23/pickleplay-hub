import { describe, expect, it } from "vitest";
import { SERIES_INITIAL_OCCURRENCES, seriesOccurrenceTimes } from "./organizerService";

const base = {
  startsAt: new Date(Date.UTC(2026, 8, 5, 14, 0)),
  endsAt: new Date(Date.UTC(2026, 8, 5, 16, 0)),
  rsvpDeadlineAt: new Date(Date.UTC(2026, 8, 5, 12, 0)),
};

describe("series occurrence planning", () => {
  it("returns the original times for the root occurrence", () => {
    expect(seriesOccurrenceTimes(base, "weekly", 0)).toEqual({ startsAt: base.startsAt, endsAt: base.endsAt, rsvpDeadlineAt: base.rsvpDeadlineAt });
  });

  it("shifts weekly occurrences by seven days", () => {
    const first = seriesOccurrenceTimes(base, "weekly", 1);
    expect(first.startsAt.getTime() - base.startsAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(first.endsAt.getTime() - base.endsAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(first.rsvpDeadlineAt?.getTime() - base.rsvpDeadlineAt!.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    const third = seriesOccurrenceTimes(base, "weekly", 3);
    expect(third.startsAt.getTime() - base.startsAt.getTime()).toBe(21 * 24 * 60 * 60 * 1000);
  });

  it("shifts biweekly occurrences by fourteen days", () => {
    const second = seriesOccurrenceTimes(base, "biweekly", 2);
    expect(second.startsAt.getTime() - base.startsAt.getTime()).toBe(28 * 24 * 60 * 60 * 1000);
  });

  it("yields a null deadline for occurrences when the root has none", () => {
    expect(seriesOccurrenceTimes({ ...base, rsvpDeadlineAt: null }, "weekly", 2).rsvpDeadlineAt).toBeNull();
  });

  it("materializes a sensible number of initial occurrences", () => {
    // A series plans 8 sessions: the root plus 7 linked drafts.
    expect(SERIES_INITIAL_OCCURRENCES).toBe(8);
    expect(SERIES_INITIAL_OCCURRENCES - 1).toBe(7);
  });
});
