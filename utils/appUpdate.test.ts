import { describe, expect, test } from "bun:test";
import {
  downloadPercent,
  isUpdatePromptDue,
  UPDATE_PROMPT_INTERVAL_MS,
} from "./appUpdate";

const now = 1_800_000_000_000;

describe("isUpdatePromptDue", () => {
  test("never shown is due", () => {
    expect(isUpdatePromptDue(undefined, now)).toBe(true);
    expect(isUpdatePromptDue(0, now)).toBe(true);
  });

  test("shown within the interval waits", () => {
    expect(isUpdatePromptDue(now - UPDATE_PROMPT_INTERVAL_MS + 1, now)).toBe(
      false,
    );
  });

  test("shown at or past the interval is due again", () => {
    expect(isUpdatePromptDue(now - UPDATE_PROMPT_INTERVAL_MS, now)).toBe(true);
  });

  test("a clock that moved backwards is due", () => {
    expect(isUpdatePromptDue(now + 60_000, now)).toBe(true);
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
