import { expect, test } from "bun:test";
import { BoundedRefresh } from "./boundedRefresh";

test("rejection and rapid success always release the refresh indicator", async () => {
  const task = new BoundedRefresh();
  const states: boolean[] = [];
  let failures = 0;
  await task.run(
    async () => {
      throw new Error("query rejected");
    },
    (v) => states.push(v),
    () => failures++,
  );
  await task.run(
    async () => {},
    (v) => states.push(v),
    () => failures++,
  );
  expect(states).toEqual([true, false, true, false]);
  expect(failures).toBe(1);
});
test("paused work times out, ignores duplicate pulls and cannot finish a newer spinner", async () => {
  const task = new BoundedRefresh();
  const states: boolean[] = [];
  let finish!: () => void;
  let calls = 0;
  const first = task.run(
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    (v) => states.push(v),
    () => {},
    5,
  );
  await task.run(
    async () => {
      calls++;
    },
    (v) => states.push(v),
    () => {},
  );
  await first;
  expect(calls).toBe(1);
  expect(states).toEqual([true, false]);
  let finishNext!: () => void;
  const next = task.run(
    () =>
      new Promise<void>((resolve) => {
        finishNext = resolve;
      }),
    (v) => states.push(v),
    () => {},
  );
  finish();
  await Promise.resolve();
  expect(states).toEqual([true, false, true]);
  finishNext();
  await next;
  expect(states).toEqual([true, false, true, false]);
});
test("unmount suppresses late errors and state updates", async () => {
  const task = new BoundedRefresh();
  const states: boolean[] = [];
  let fail!: (reason: Error) => void;
  let errors = 0;
  const pending = task.run(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
    (v) => states.push(v),
    () => errors++,
  );
  task.dispose();
  fail(new Error("late"));
  await pending;
  expect(states).toEqual([true]);
  expect(errors).toBe(0);
});
