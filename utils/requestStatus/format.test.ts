import { describe, expect, test } from "bun:test";
import { createRowFormat } from "./format";

const fmt = createRowFormat({
  locale: "en-US",
  timeZone: "America/New_York",
  hour12: true,
});
const NOW = Date.parse("2026-11-20T21:15:00Z");

describe("row dates (TV patterns)", () => {
  test("request day: month and day this year, with the year otherwise", () => {
    expect(fmt.requestedOn(Date.parse("2026-11-03T15:00:00Z"), NOW)).toBe(
      "Nov 3",
    );
    expect(fmt.requestedOn(Date.parse("2025-12-30T15:00:00Z"), NOW)).toBe(
      "Dec 30, 2025",
    );
  });

  test("a calendar date is never shifted by the time zone", () => {
    expect(fmt.releaseOn("2026-12-03", NOW)).toBe("Dec 3");
    expect(fmt.releaseOn("2027-01-01", NOW)).toBe("Jan 1, 2027");
  });

  test("air time: weekday, date and time in the device zone", () => {
    expect(fmt.airingAt(Date.parse("2026-11-23T02:00:00Z"), NOW)).toBe(
      "Sun, Nov 22 · 9:00 PM",
    );
    expect(fmt.airingAt(Date.parse("2027-01-05T01:00:00Z"), NOW)).toBe(
      "Mon, Jan 4, 2027 · 8:00 PM",
    );
  });

  test("24-hour time when the device uses it", () => {
    const h24 = createRowFormat({
      locale: "en-GB",
      timeZone: "UTC",
      hour12: false,
    });
    expect(h24.airingAt(Date.parse("2026-11-23T19:05:00Z"), NOW)).toContain(
      "19:05",
    );
  });
});
