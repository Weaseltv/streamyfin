import { describe, expect, test } from "bun:test";
import {
  downloadPercent,
  isUpdatePromptDue,
  splitReleaseNotes,
  UPDATE_PROMPT_INTERVAL_MS,
} from "./appUpdate";

const now = 1_800_000_000_000;

describe("isUpdatePromptDue", () => {
  const sameVersion = (shownAt: number | undefined) => ({
    shownAt,
    versionCode: 10,
  });

  test("never shown is due", () => {
    expect(
      isUpdatePromptDue(
        { shownAt: undefined, versionCode: undefined },
        10,
        now,
      ),
    ).toBe(true);
    expect(isUpdatePromptDue(sameVersion(0), 10, now)).toBe(true);
  });

  test("a time from before the version was stored is due", () => {
    expect(
      isUpdatePromptDue(
        { shownAt: now - 1000, versionCode: undefined },
        10,
        now,
      ),
    ).toBe(true);
  });

  test("the same release within the interval waits", () => {
    expect(
      isUpdatePromptDue(
        sameVersion(now - UPDATE_PROMPT_INTERVAL_MS + 1),
        10,
        now,
      ),
    ).toBe(false);
  });

  test("the same release at or past the interval is due again", () => {
    expect(
      isUpdatePromptDue(sameVersion(now - UPDATE_PROMPT_INTERVAL_MS), 10, now),
    ).toBe(true);
  });

  test("a newer release is due straight away", () => {
    expect(isUpdatePromptDue(sameVersion(now - 60_000), 11, now)).toBe(true);
  });

  test("a clock that moved backwards is due", () => {
    expect(isUpdatePromptDue(sameVersion(now + 60_000), 10, now)).toBe(true);
  });
});

describe("downloadPercent", () => {
  test("rounds down and clamps", () => {
    expect(downloadPercent(0, 200)).toBe(0);
    expect(downloadPercent(99, 200)).toBe(49);
    expect(downloadPercent(200, 200)).toBe(100);
    expect(downloadPercent(300, 200)).toBe(100);
  });

  test("unknown total is 0", () => {
    expect(downloadPercent(50, 0)).toBe(0);
  });
});

describe("splitReleaseNotes", () => {
  test("first entry is the summary, the rest are bullets", () => {
    expect(
      splitReleaseNotes(["Faster startup.", "Fixes a crash.", "New icon."]),
    ).toEqual({
      summary: "Faster startup.",
      bullets: ["Fixes a crash.", "New icon."],
    });
  });

  test("drops the old publish placeholder and blank entries", () => {
    expect(splitReleaseNotes(["Agent stable publish"])).toEqual({
      summary: null,
      bullets: [],
    });
    expect(splitReleaseNotes(["  ", "Only line"])).toEqual({
      summary: "Only line",
      bullets: [],
    });
  });
});
