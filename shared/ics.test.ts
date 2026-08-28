import { describe, expect, it } from "vitest";
import { buildCalendar, toIcsTimestamp } from "@shared/ics";

describe("buildCalendar", () => {
  it("renders a VCALENDAR with one VEVENT per game", () => {
    const ics = buildCalendar([
      { id: 7, title: "Saturday Rally", description: "Open doubles", startsAt: Date.UTC(2026, 8, 5, 14, 0), endsAt: Date.UTC(2026, 8, 5, 16, 0), venueName: "Riverside Courts" },
    ]);
    const lines = ics.split("\r\n");
    expect(lines).toContain("BEGIN:VCALENDAR");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("UID:game-7@pickleplay");
    expect(lines).toContain("DTSTART:20260905T140000Z");
    expect(lines).toContain("DTEND:20260905T160000Z");
    expect(lines).toContain("SUMMARY:Saturday Rally");
    expect(lines).toContain("LOCATION:Riverside Courts");
    expect(lines).toContain("END:VCALENDAR");
  });

  it("escapes RFC 5545 special characters and folds newlines", () => {
    const ics = buildCalendar([
      { id: 1, title: "Semi;Colon, Comma", description: "line one\nline two\\backslash", startsAt: 0, endsAt: 0, venueName: "A;B" },
    ]);
    expect(ics).toContain("SUMMARY:Semi\\;Colon\\, Comma");
    expect(ics).toContain("DESCRIPTION:line one\\nline two\\\\backslash");
    expect(ics).toContain("LOCATION:A\\;B");
  });

  it("formats UTC timestamps without milliseconds", () => {
    expect(toIcsTimestamp(Date.UTC(2026, 0, 15, 9, 30))).toBe("20260115T093000Z");
  });
});
