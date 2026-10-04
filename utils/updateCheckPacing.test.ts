import { describe, expect, test } from "bun:test";
import {
  AUTOMATIC_UPDATE_INTERVAL_MS,
  createUpdateCheckPacer,
  FAILED_UPDATE_RETRY_MS,
  parseUpdateCheckCompletion,
  type UpdateCheckCompletion,
} from "./updateCheckPacing";

const harness = (initial: UpdateCheckCompletion | null = null) => {
  let time = 1_000_000;
  let completion = initial;
  let calls = 0;
  const options = {
    read: () => completion,
    write: (value: UpdateCheckCompletion) => {
      completion = value;
    },
    now: () => time,
  };
  return {
    pacer: createUpdateCheckPacer<number>(options),
    restart: () => createUpdateCheckPacer<number>(options),
    check: async () => ++calls,
    count: () => calls,
    advance: (ms: number) => {
      time += ms;
    },
  };
};

describe("automatic update pacing", () => {
  test("deduplicates simultaneous callers including a manual check", async () => {
    const h = harness();
    const automatic = h.pacer.run(h.check);
    const manual = h.pacer.run(h.check, true);
    expect(automatic).toBe(manual);
    expect(await automatic).toBe(1);
    expect(h.count()).toBe(1);
  });
  test("persists the successful cooldown across a process restart; manual checks bypass it", async () => {
    const h = harness();
    await h.pacer.run(h.check);
    expect(await h.restart().run(h.check)).toBeNull();
    expect(await h.pacer.run(h.check, true)).toBe(2);
    h.advance(AUTOMATIC_UPDATE_INTERVAL_MS);
    expect(await h.pacer.run(h.check)).toBe(3);
  });
  test("failed and thrown checks become retryable after a minute", async () => {
    const h = harness();
    await h.pacer.run(async () => null);
    expect(await h.pacer.run(h.check)).toBeNull();
    h.advance(FAILED_UPDATE_RETRY_MS);
    await expect(
      h.pacer.run(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    h.advance(FAILED_UPDATE_RETRY_MS);
    expect(await h.pacer.run(h.check)).toBe(1);
  });
  test("a clock moving backwards does not silence checks", async () => {
    const h = harness({ at: 2_000_000, failed: false });
    expect(await h.pacer.run(h.check)).toBe(1);
  });
  test("malformed storage cannot suppress a request", () => {
    for (const raw of [
      undefined,
      "broken",
      "null",
      '{"at":"1000000","failed":false}',
      '{"at":0,"failed":false}',
      '{"at":1000000}',
    ])
      expect(parseUpdateCheckCompletion(raw)).toBeNull();
    expect(parseUpdateCheckCompletion('{"at":1000000,"failed":false}')).toEqual(
      { at: 1000000, failed: false },
    );
  });
});
