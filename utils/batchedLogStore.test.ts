import { describe, expect, it } from "bun:test";
import { createBatchedLogStore } from "./batchedLogStore";

function fixture(initial = "[]") {
  let persisted = initial;
  let reads = 0;
  let writes = 0;
  let failWrite = false;
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const store = createBatchedLogStore<{ id: number }>({
    read: () => {
      reads++;
      return persisted;
    },
    write: (value) => {
      if (failWrite) throw new Error("storage unavailable");
      writes++;
      persisted = value;
    },
    capacity: 3,
    schedule: (fn) => {
      const id = ++nextTimer;
      timers.set(id, fn);
      return id;
    },
    cancel: (id) => timers.delete(id as number),
  });
  return {
    store,
    counts: () => ({ reads, writes, timers: timers.size }),
    saved: () => JSON.parse(persisted),
    fail: (value: boolean) => {
      failWrite = value;
    },
    tick: () => {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) callback();
    },
  };
}

describe("batched diagnostic log", () => {
  it("reads once and batches a burst without postponing the first timer", () => {
    const f = fixture();
    for (let id = 1; id <= 20; id++) f.store.append({ id });
    expect(f.counts()).toEqual({ reads: 1, writes: 0, timers: 1 });
    expect(f.store.read()).toEqual([{ id: 18 }, { id: 19 }, { id: 20 }]);
    f.tick();
    expect(f.counts()).toEqual({ reads: 1, writes: 1, timers: 0 });
    expect(f.saved()).toEqual(f.store.read());
  });

  it("flushes an urgent error and cancels the routine timer", () => {
    const f = fixture();
    f.store.append({ id: 1 });
    f.store.append({ id: 2 }, true);
    expect(f.saved()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(f.counts()).toEqual({ reads: 1, writes: 1, timers: 0 });
    f.store.flush();
    expect(f.counts().writes).toBe(1);
  });

  it("bounds legacy logs and snapshots mutable caller data", () => {
    const f = fixture('[{"id":1},{"id":2},{"id":3},{"id":4}]');
    const entry = { id: 5 };
    f.store.append(entry);
    entry.id = 99;
    f.store.flush();
    expect(f.saved()).toEqual([{ id: 3 }, { id: 4 }, { id: 5 }]);
  });

  it("keeps the prior valid log on write failure and retries pending entries", () => {
    const f = fixture('[{"id":1}]');
    f.fail(true);
    f.store.append({ id: 2 }, true);
    expect(f.saved()).toEqual([{ id: 1 }]);
    expect(f.counts().timers).toBe(1);
    f.fail(false);
    f.tick();
    expect(f.saved()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("recovers corrupt persisted diagnostics and flushes a background boundary", () => {
    const f = fixture("invalid JSON");
    expect(f.store.read()).toEqual([]);
    f.store.append({ id: 1 });
    f.store.flush();
    expect(f.saved()).toEqual([{ id: 1 }]);
    expect(f.counts().timers).toBe(0);
  });

  it("rejects a circular entry without damaging the prior pending ring", () => {
    const f = fixture();
    f.store.append({ id: 1 });
    const circular: any = { id: 2 };
    circular.self = circular;
    expect(() => f.store.append(circular)).toThrow();
    f.store.flush();
    expect(f.saved()).toEqual([{ id: 1 }]);
  });
});
