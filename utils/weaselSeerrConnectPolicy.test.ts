import { describe, expect, test } from "bun:test";
import {
  AUTO_RETRY_COOLDOWN_MS,
  canRetryManually,
  MANUAL_RETRY_GAP_MS,
  shouldSkipAutoConnect,
} from "./weaselSeerrConnectPolicy";

const FAIL2BAN_WINDOW_MS = 10 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("shouldSkipAutoConnect", () => {
  test("runs when Seerr never refused this user", () => {
    expect(shouldSkipAutoConnect(undefined, NOW)).toBe(false);
  });

  test("skips a cold start right after a refusal", () => {
    expect(shouldSkipAutoConnect(NOW - 1000, NOW)).toBe(true);
  });

  test("retries once the cooldown has passed", () => {
    expect(shouldSkipAutoConnect(NOW - AUTO_RETRY_COOLDOWN_MS, NOW)).toBe(
      false,
    );
  });

  test("cooldown outlasts the fail2ban window, so one device is one strike", () => {
    expect(AUTO_RETRY_COOLDOWN_MS).toBeGreaterThan(FAIL2BAN_WINDOW_MS);
  });
});

describe("canRetryManually", () => {
  test("allows a retry when nothing was refused", () => {
    expect(canRetryManually(undefined, NOW)).toBe(true);
  });

  test("blocks a second tap straight after a refusal", () => {
    expect(canRetryManually(NOW - 1000, NOW)).toBe(false);
  });

  test("allows a tap after the gap", () => {
    expect(canRetryManually(NOW - MANUAL_RETRY_GAP_MS, NOW)).toBe(true);
  });

  test("gap keeps one device under five strikes per fail2ban window", () => {
    expect(
      Math.floor(FAIL2BAN_WINDOW_MS / MANUAL_RETRY_GAP_MS) + 1,
    ).toBeLessThan(5);
  });
});
