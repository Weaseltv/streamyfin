import { describe, expect, test } from "bun:test";
import {
  canProbe,
  canProve,
  canTriggerMismatch,
  canVerify,
  emptyRecovery,
  isPaused,
  markCheck,
  markDenied,
  markExchange,
  markMismatchTriggered,
  markProofDenied,
  markRateLimited,
  PROBE_INTERVAL_MS,
  retryAfterMs,
} from "./recovery";

const A = "viewer|https://requests.theweasel.tv";
const T0 = 1_800_000_000_000;
const MIN = 60_000;

describe("rule 6: rationed recovery", () => {
  test("a denied identity check blocks a new check for 15 minutes", () => {
    let s = markDenied(emptyRecovery(), A, T0);
    expect(canVerify(s, A, T0 + MIN)).toBe(false);
    expect(canProbe(s, A, T0 + MIN)).toBe(false);
    expect(canVerify(s, A, T0 + PROBE_INTERVAL_MS)).toBe(true);
    s = markCheck(s, A, T0 + PROBE_INTERVAL_MS);
    expect(canProbe(s, A, T0 + PROBE_INTERVAL_MS + MIN)).toBe(false);
  });

  test("a successful sign-in exchange lets the new scope check again at once", () => {
    let s = markDenied(emptyRecovery(), A, T0);
    s = markExchange(s, A, T0 + MIN);
    expect(canVerify(s, A, T0 + 2 * MIN)).toBe(true);
    // An exchange that happened before the denial does not count.
    let t = markExchange(emptyRecovery(), A, T0);
    t = markDenied(t, A, T0 + MIN);
    expect(canVerify(t, A, T0 + 2 * MIN)).toBe(false);
  });

  test("a successful check does not start the throttle, but counts as the probe", () => {
    const s = markCheck(emptyRecovery(), A, T0);
    expect(canVerify(s, A, T0 + MIN)).toBe(true);
    expect(canProbe(s, A, T0 + MIN)).toBe(false);
    expect(canProbe(s, A, T0 + PROBE_INTERVAL_MS)).toBe(true);
  });

  test("a 429 pauses checks and probes for 15 minutes or the longer Retry-After", () => {
    let s = markRateLimited(emptyRecovery(), A, T0, 0);
    expect(isPaused(s, A, T0 + 14 * MIN)).toBe(true);
    expect(canVerify(s, A, T0 + 14 * MIN)).toBe(false);
    expect(canProbe(s, A, T0 + 14 * MIN)).toBe(false);
    expect(isPaused(s, A, T0 + 15 * MIN)).toBe(false);
    s = markRateLimited(emptyRecovery(), A, T0, 40 * MIN);
    expect(isPaused(s, A, T0 + 30 * MIN)).toBe(true);
    // A later shorter pause never shortens a longer one.
    s = markRateLimited(s, A, T0 + MIN, 0);
    expect(isPaused(s, A, T0 + 30 * MIN)).toBe(true);
  });

  test("accounts are independent", () => {
    const s = markDenied(emptyRecovery(), A, T0);
    expect(canVerify(s, "other|https://requests.theweasel.tv", T0 + MIN)).toBe(
      true,
    );
  });

  test("the mismatch reconnect runs once per media-server user per app session", () => {
    let s = emptyRecovery();
    expect(canTriggerMismatch(s, "u1")).toBe(true);
    s = markMismatchTriggered(s, "u1");
    expect(canTriggerMismatch(s, "u1")).toBe(false);
    expect(markMismatchTriggered(s, "u1")).toBe(s);
    expect(canTriggerMismatch(s, "u2")).toBe(true);
  });

  test("Retry-After in seconds or as a date", () => {
    expect(retryAfterMs("5", T0)).toBe(5000);
    expect(retryAfterMs(new Date(T0 + 90_000).toUTCString(), T0)).toBe(90_000);
    expect(retryAfterMs("soon", T0)).toBe(0);
    expect(retryAfterMs(undefined, T0)).toBe(0);
  });

  test("a denied transport proof is not repeated for 15 minutes; a 429 pauses it too", () => {
    let s = markProofDenied(emptyRecovery(), A, T0);
    expect(canProve(s, A, T0 + MIN)).toBe(false);
    expect(canProve(s, A, T0 + PROBE_INTERVAL_MS)).toBe(true);
    // A denied proof does not by itself stop the axios session check.
    expect(canVerify(s, A, T0 + MIN)).toBe(true);
    s = markRateLimited(emptyRecovery(), A, T0, 0);
    expect(canProve(s, A, T0 + MIN)).toBe(false);
  });
});
