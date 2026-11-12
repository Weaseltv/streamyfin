import { describe, expect, test } from "bun:test";
import { formatAirDate } from "./time";

describe("formatAirDate", () => {
  test("shows the air date the server stores at midnight US Eastern", () => {
    // Daylight time (04:00 UTC) and standard time (05:00 UTC)
    expect(formatAirDate("2026-10-16T04:00:00.0000000Z", "en-US")).toBe(
      "Oct 16, 2026",
    );
    expect(formatAirDate("2026-01-08T05:00:00.0000000Z", "en-US")).toBe(
      "Jan 8, 2026",
    );
  });

  test("gives nothing without a valid date", () => {
    expect(formatAirDate(undefined)).toBeNull();
    expect(formatAirDate(null)).toBeNull();
    expect(formatAirDate("")).toBeNull();
    expect(formatAirDate("not a date")).toBeNull();
  });
});
