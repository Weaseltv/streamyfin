import { describe, expect, test } from "bun:test";
import { type OpenRowIntent, readyRenderCount, resolveIntent } from "./intent";
import { nextFailures, syncDelayMs } from "./scheduler";

const intent: OpenRowIntent = { scopeKey: "s", requestId: 9, raisedAt: 100 };

describe("open-row intent", () => {
  test("scrolls when the row is there", () => {
    expect(
      resolveIntent(intent, {
        scopeKey: "s",
        rowIds: new Set([9]),
        lastSyncSettledAt: null,
      }),
    ).toEqual({
      kind: "scroll",
      requestId: 9,
    });
  });

  test("waits for the next sync; consumed without scrolling once a later sync settled", () => {
    expect(
      resolveIntent(intent, {
        scopeKey: "s",
        rowIds: new Set(),
        lastSyncSettledAt: 50,
      }).kind,
    ).toBe("wait");
    expect(
      resolveIntent(intent, {
        scopeKey: "s",
        rowIds: new Set(),
        lastSyncSettledAt: 150,
      }).kind,
    ).toBe("consume");
  });

  test("dropped for another scope; an intent without a row is consumed", () => {
    expect(
      resolveIntent(intent, {
        scopeKey: "t",
        rowIds: new Set([9]),
        lastSyncSettledAt: 150,
      }).kind,
    ).toBe("drop");
    expect(
      resolveIntent(intent, {
        scopeKey: null,
        rowIds: new Set([9]),
        lastSyncSettledAt: 150,
      }).kind,
    ).toBe("drop");
    expect(
      resolveIntent(
        { ...intent, requestId: null },
        { scopeKey: "s", rowIds: new Set(), lastSyncSettledAt: null },
      ).kind,
    ).toBe("consume");
  });

  test("a Ready target at position 31 and beyond grows the rendered count first", () => {
    expect(readyRenderCount(30, null)).toBe(30);
    expect(readyRenderCount(30, 29)).toBe(30);
    expect(readyRenderCount(30, 30)).toBe(60);
    expect(readyRenderCount(30, 75)).toBe(90);
    expect(readyRenderCount(90, 75)).toBe(90);
  });
});

describe("sync schedule", () => {
  test("every minute; failures back off 1, 2, 5, 10 minutes", () => {
    expect(syncDelayMs(0)).toBe(60_000);
    let f = 0;
    const waits = [];
    for (let i = 0; i < 6; i++) {
      f = nextFailures(f, false);
      waits.push(syncDelayMs(f) / 60_000);
    }
    expect(waits).toEqual([1, 2, 5, 10, 10, 10]);
    expect(nextFailures(4, true)).toBe(0);
  });
});
