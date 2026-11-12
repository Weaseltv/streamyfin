import { expect, test } from "bun:test";
import {
  TrickplayPrefetchQueue,
  trickplaySheetWindow,
} from "./trickplayPrefetch";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const requests = () => {
  const calls: string[] = [];
  const pending = new Map<string, (success: boolean) => void>();
  const queue = new TrickplayPrefetchQueue((url) => {
    calls.push(url);
    return new Promise((resolve) => pending.set(url, resolve));
  });
  return { calls, pending, queue };
};

test("a new scrub cancels obsolete queued sheets and bounds concurrent requests", async () => {
  const { calls, pending, queue } = requests();
  queue.replace(["one", "two", "obsolete"]);
  await tick();
  expect(calls).toEqual(["one", "two"]);
  queue.replace(["target", "neighbor"]);
  pending.get("one")!(true);
  await tick();
  expect(calls).toEqual(["one", "two", "target"]);
  queue.dispose();
  pending.get("two")!(true);
  pending.get("target")!(true);
  await tick();
  expect(calls).not.toContain("obsolete");
  expect(calls).not.toContain("neighbor");
});

test("deduplicates active and cached sheets but permits retry after failure", async () => {
  const { calls, pending, queue } = requests();
  queue.replace(["one", "one", "two"]);
  await tick();
  queue.replace(["one", "two"]);
  pending.get("one")!(true);
  pending.get("two")!(false);
  await tick();
  queue.replace(["one", "two"]);
  await tick();
  expect(calls).toEqual(["one", "two", "two"]);
  queue.dispose();
  pending.get("two")!(true);
});

test("sheet windows prefer the target and respect both ends of the title", () => {
  expect(trickplaySheetWindow(0, 5)).toEqual([0, 1]);
  expect(trickplaySheetWindow(3, 5)).toEqual([3, 4, 2]);
  expect(trickplaySheetWindow(4, 5)).toEqual([4, 3]);
});

test("unmount before the microtask starts prevents pending image requests", async () => {
  const { calls, queue } = requests();
  queue.replace(["one", "two", "three"]);
  queue.dispose();
  queue.replace(["new-window"]);
  await tick();
  expect(calls).toEqual([]);
});
