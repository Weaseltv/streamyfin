import { describe, expect, test } from "bun:test";
import {
  formatClockTime,
  formatPlayerTime,
  multiplierLabel,
  pickCenterRow,
  sleepTimerLabel,
} from "./androidPlayerChrome";

describe("formatPlayerTime (iOS formatTime)", () => {
  test("minutes and seconds under an hour", () => {
    expect(formatPlayerTime(0)).toBe("0:00");
    expect(formatPlayerTime(176)).toBe("2:56");
    expect(formatPlayerTime(59.6)).toBe("1:00");
  });

  test("hours, minutes and seconds from an hour", () => {
    expect(formatPlayerTime(10695)).toBe("2:58:15");
    expect(formatPlayerTime(3600)).toBe("1:00:00");
  });

  test("bad input degrades to 0:00", () => {
    expect(formatPlayerTime(Number.NaN)).toBe("0:00");
    expect(formatPlayerTime(-5)).toBe("0:00");
    expect(formatPlayerTime(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

test("formatClockTime is a fixed 24-hour HH:mm", () => {
  expect(formatClockTime(new Date(2026, 10, 20, 23, 5))).toBe("23:05");
  expect(formatClockTime(new Date(2026, 10, 20, 7, 30))).toBe("07:30");
});

test("multiplierLabel matches iOS %g×", () => {
  expect(multiplierLabel(1)).toBe("1×");
  expect(multiplierLabel(0.25)).toBe("0.25×");
  expect(multiplierLabel(2.5)).toBe("2.5×");
});

test("sleepTimerLabel matches iOS", () => {
  expect(sleepTimerLabel(15)).toBe("15 min");
  expect(sleepTimerLabel(60)).toBe("1 h");
  expect(sleepTimerLabel(90)).toBe("1.5 h");
  expect(sleepTimerLabel(120)).toBe("2 h");
});

describe("pickCenterRow (iOS ViewThatFits tiers)", () => {
  // 440 pt portrait phone, edge sliders shown: 440 - 2 × 62.
  const portrait = 440 - 124;

  test("a film fits the regular row in portrait", () => {
    const row = pickCenterRow({
      availableWidth: portrait,
      hasChapters: false,
      isEpisode: false,
    });
    expect(row.density).toBe("regular");
    expect(row.playButton).toBe(80);
    expect(row.showEpisodeButtons).toBe(false);
  });

  test("an episode steps down to the dense row with episode buttons", () => {
    const row = pickCenterRow({
      availableWidth: portrait,
      hasChapters: false,
      isEpisode: true,
    });
    expect(row.density).toBe("dense");
    expect(row.showEpisodeButtons).toBe(true);
  });

  test("a chaptered episode drops the episode buttons as a last resort", () => {
    const row = pickCenterRow({
      availableWidth: 300,
      hasChapters: true,
      isEpisode: true,
    });
    expect(row.density).toBe("dense");
    expect(row.showEpisodeButtons).toBe(false);
  });

  test("landscape fits everything at the regular density", () => {
    const row = pickCenterRow({
      availableWidth: 956 - 124,
      hasChapters: true,
      isEpisode: true,
    });
    expect(row.density).toBe("regular");
    expect(row.spacing).toBe(24);
    expect(row.showEpisodeButtons).toBe(true);
  });
});
