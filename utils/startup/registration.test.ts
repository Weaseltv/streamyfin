import { describe, expect, test } from "bun:test";
import { startSessionRegistration } from "./registration";

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function harness(register: () => Promise<void>) {
  let current = true;
  let errors = 0;
  let completed = 0;
  const timers: { run: () => void; delay: number; cancelled: boolean }[] = [];
  const stop = startSessionRegistration({
    register,
    isCurrent: () => current,
    onError: () => errors++,
    onComplete: () => completed++,
    schedule: (run, delay) => {
      const timer = { run, delay, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  });
  return {
    timers,
    stop,
    logout: () => {
      current = false;
    },
    counts: () => ({ errors, completed }),
  };
}

describe("session startup registration", () => {
  test("recovers from a transient token failure and stops after success", async () => {
    let calls = 0;
    const run = harness(async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
    });
    await settle();
    expect(run.timers.map((timer) => timer.delay)).toEqual([60_000]);
    run.timers[0].run();
    await settle();
    expect(calls).toBe(2);
    expect(run.counts()).toEqual({ errors: 1, completed: 1 });
    expect(run.timers).toHaveLength(1);
  });

  test("a persistent failure has only two delayed retries", async () => {
    let calls = 0;
    const run = harness(async () => {
      calls++;
      throw new Error("unconfigured device");
    });
    await settle();
    run.timers[0].run();
    await settle();
    run.timers[1].run();
    await settle();
    expect(calls).toBe(3);
    expect(run.timers.map((timer) => timer.delay)).toEqual([60_000, 180_000]);
    expect(run.counts()).toEqual({ errors: 3, completed: 0 });
  });

  test("unmount cancels a scheduled retry", async () => {
    let calls = 0;
    const run = harness(async () => {
      calls++;
      throw new Error("offline");
    });
    await settle();
    run.stop();
    expect(run.timers[0].cancelled).toBe(true);
    run.timers[0].run();
    await settle();
    expect(calls).toBe(1);
  });

  test("logout prevents a late rejected attempt from scheduling or logging", async () => {
    let reject: (error: Error) => void = () => {};
    const run = harness(
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    run.logout();
    reject(new Error("old session"));
    await settle();
    expect(run.counts()).toEqual({ errors: 0, completed: 0 });
    expect(run.timers).toHaveLength(0);
  });

  test("an old session's queued retry cannot start after account switch", async () => {
    let calls = 0;
    const run = harness(async () => {
      calls++;
      throw new Error("offline");
    });
    await settle();
    run.logout();
    run.timers[0].run();
    await settle();
    expect(calls).toBe(1);
  });
});
