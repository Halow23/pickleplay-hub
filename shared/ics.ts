export type CalendarGame = {
  id: number;
  title: string;
  description: string;
  startsAt: number | Date;
  endsAt: number | Date;
  venueName: string;
};

export function toIcsTimestamp(value: number | Date): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  // RFC 5545: backslashes, semicolons, and commas are escaped; newlines
  // become literal \n.
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Builds a VCALENDAR for the given games. Shared by the client download and the server feed. */
export function buildCalendar(events: CalendarGame[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PicklePlay//EN", "CALSCALE:GREGORIAN"];
  for (const game of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:game-${game.id}@pickleplay`,
      `DTSTART:${toIcsTimestamp(game.startsAt)}`,
      `DTEND:${toIcsTimestamp(game.endsAt)}`,
      `SUMMARY:${escapeIcsText(game.title)}`,
      `LOCATION:${escapeIcsText(game.venueName)}`,
      `DESCRIPTION:${escapeIcsText(game.description)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
