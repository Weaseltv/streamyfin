import { expect, test } from "bun:test";
import {
  cloneDownloadMedia,
  DownloadPreparations,
  PreparationQueue,
  preparationStage,
} from "../providers/Downloads/preparation";

test("double tap and Low→Max reserve one destination before the first await", () => {
  const registry = new DownloadPreparations();
  const op = registry.reserve("item", "session")!;
  expect(registry.reserve("item", "session")).toBeUndefined();
  registry.cancel("item");
  expect(() => op.assertActive()).toThrow();
  expect(registry.reserve("item", "session")).toBeUndefined();
  registry.release(op);
  const next = registry.reserve("item", "session")!;
  registry.release(op);
  expect(() => next.assertActive()).not.toThrow();
});
test("session changes and timeouts block late results but allow retry", async () => {
  const registry = new DownloadPreparations();
  const op = registry.reserve("item", "old")!;
  let resolve!: (value: string) => void;
  const pending = preparationStage(
    op,
    () =>
      new Promise<string>((r) => {
        resolve = r;
      }),
    5,
  );
  await expect(pending).rejects.toThrow("timeout");
  registry.cancelOwner("old");
  registry.release(op);
  const next = registry.reserve("item", "new")!;
  resolve("late");
  await Promise.resolve();
  expect(() => op.assertActive()).toThrow();
  expect(() => next.assertActive()).not.toThrow();
});
test("slow advancing progress is accepted, repeated zero bytes is a stall", async () => {
  const registry = new DownloadPreparations();
  const op = registry.reserve("item", "session")!;
  const result = await preparationStage(
    op,
    async (stage) => {
      for (let bytes = 1; bytes <= 5; bytes++) {
        await new Promise((r) => setTimeout(r, 3));
        stage.progress(bytes);
      }
      return "ready";
    },
    8,
    100,
  );
  expect(result).toBe("ready");
  await expect(
    preparationStage(op, () => new Promise(() => {}), 5),
  ).rejects.toThrow("timeout");
});
test("media and subtitle delivery URLs are cloned without changing cached metadata", () => {
  const cached = {
    Id: "source",
    MediaStreams: [{ Index: 2, DeliveryUrl: "/remote.srt" }],
  };
  const downloaded = cloneDownloadMedia(cached);
  downloaded.MediaStreams[0].DeliveryUrl = "file:///owned.srt";
  expect(cached.MediaStreams[0].DeliveryUrl).toBe("/remote.srt");
  expect(downloaded).not.toBe(cached);
  expect(downloaded.MediaStreams[0]).not.toBe(cached.MediaStreams[0]);
});

test("batch rows reserve immediately but native preparation follows admission order", async () => {
  const queue = new PreparationQueue();
  const registry = new DownloadPreparations();
  const operations = ["one", "two", "three"].map(
    (id) => registry.reserve(id, "session")!,
  );
  const releases = operations.map((operation) =>
    queue.acquire(operation.signal),
  );
  const first = await releases[0];
  let thirdReady = false;
  void releases[2].then(() => {
    thirdReady = true;
  });
  const second = releases[1].catch((error) => error);
  operations[1].cancel();
  expect((await second).message).toContain("cancelled");
  expect(thirdReady).toBe(false);
  first();
  const third = await releases[2];
  expect(thirdReady).toBe(true);
  third();
});
