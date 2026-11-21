import { describe, expect, test } from "bun:test";
import { ExchangeQueue, ExchangeSupersededError } from "./exchangeQueue";

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("rule 1: one request sign-in at a time", () => {
  test("a newer exchange aborts the older one and starts only after it finished", async () => {
    const q = new ExchangeQueue();
    const log: string[] = [];
    const first = deferred<string>();
    let firstSignal: AbortSignal | undefined;
    const a = q.run(async ({ signal }) => {
      firstSignal = signal;
      log.push("a:start");
      const v = await first.promise;
      log.push("a:end");
      return v;
    });
    await Promise.resolve();
    await Promise.resolve();
    const b = q.run(async ({ isCurrent }) => {
      log.push("b:start");
      return isCurrent() ? "b" : "stale";
    });
    expect(firstSignal?.aborted).toBe(true);
    await Promise.resolve();
    expect(log).toEqual(["a:start"]);
    first.resolve("a");
    const ra = await a;
    const rb = await b;
    expect(log).toEqual(["a:start", "a:end", "b:start"]);
    // The older exchange finished, but its result is not current and must not be saved.
    expect(ra).toEqual({ result: "a", current: false });
    expect(rb).toEqual({ result: "b", current: true });
  });

  test("an exchange replaced before it started never runs", async () => {
    const q = new ExchangeQueue();
    const gate = deferred<void>();
    const a = q.run(async () => gate.promise);
    let bRan = false;
    const b = q.run(async () => {
      bRan = true;
    });
    const c = q.run(async () => "c");
    gate.resolve();
    await a;
    await expect(b).rejects.toBeInstanceOf(ExchangeSupersededError);
    expect(bRan).toBe(false);
    expect(await c).toEqual({ result: "c", current: true });
  });

  test("listeners hear each start before its network work; cancel invalidates the running one", async () => {
    const q = new ExchangeQueue();
    const log: string[] = [];
    q.onStart(() => log.push("stop request work"));
    const gate = deferred<void>();
    const a = q.run(async ({ isCurrent }) => {
      log.push("exchange");
      await gate.promise;
      return isCurrent();
    });
    await Promise.resolve();
    await Promise.resolve();
    q.cancel();
    gate.resolve();
    expect(await a).toEqual({ result: false, current: false });
    expect(log).toEqual(["stop request work", "exchange"]);
  });
});
