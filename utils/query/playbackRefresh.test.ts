import { afterEach, describe, expect, test } from "bun:test";
import {
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/query-core";
import { PlaybackRefreshQueue } from "./playbackRefresh";

const queues: PlaybackRefreshQueue[] = [];
const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const queue = new PlaybackRefreshQueue(client);
  queues.push(queue);
  for (const key of [
    ["item", "played"],
    ["item", "other-client"],
    ["item", "unrelated"],
    ["item", "played", ["People"]],
    ["home", "continueAndNextUp"],
    ["home", "hero"],
    ["home", "recentlyAdded"],
    ["library-items", "movies"],
    ["episodes", "show"],
    ["episodes", "other-show"],
    ["AllEpisodes", "show"],
    ["downloadedItems"],
  ])
    client.setQueryData(key, {
      Id: key[1],
      UserData: { PlaybackPositionTicks: 10 },
    });
  const stale = (key: readonly unknown[]) =>
    client.getQueryState(key)?.isInvalidated;
  return { client, queue, stale };
};
afterEach(() => {
  for (const queue of queues) queue.open();
  queues.length = 0;
  onlineManager.setOnline(true);
});

describe("playback refresh ordering", () => {
  test("retains other-client changes until transition, excluding catalog and People", async () => {
    const { client, queue, stale } = setup();
    queue.open();
    queue.userDataChanged(["other-client"]);
    queue.stopped({ Id: "played", SeriesId: "show" }, 700, Promise.resolve());
    await queue.flush();
    expect(stale(["home", "continueAndNextUp"])).toBe(false);
    expect(
      client.getQueryData<{ UserData: { PlaybackPositionTicks: number } }>([
        "item",
        "played",
      ])?.UserData.PlaybackPositionTicks,
    ).toBe(700);
    queue.close();
    await queue.flush();
    for (const key of [
      ["item", "played"],
      ["item", "other-client"],
      ["home", "continueAndNextUp"],
      ["home", "hero"],
      ["episodes", "show"],
      ["AllEpisodes", "show"],
    ])
      expect(stale(key)).toBe(true);
    for (const key of [
      ["item", "unrelated"],
      ["item", "played", ["People"]],
      ["home", "recentlyAdded"],
      ["library-items", "movies"],
      ["episodes", "other-show"],
      ["downloadedItems"],
    ])
      expect(stale(key)).toBe(false);
  });

  test("reconciles only the played download after stop reporting and transition", async () => {
    const { queue, stale } = setup();
    let finish!: () => void;
    const report = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let syncCalls = 0;
    queue.open();
    queue.stopped({ Id: "played" }, 700, report, async () => {
      syncCalls++;
    });
    await queue.flush();
    expect(syncCalls).toBe(0);
    queue.close();
    const pending = queue.flush();
    await Promise.resolve();
    expect(syncCalls).toBe(0);
    expect(stale(["item", "played"])).toBe(false);
    finish();
    await pending;
    expect(syncCalls).toBe(1);
    expect(stale(["item", "played"])).toBe(true);
  });

  test("another player opening during reporting keeps dirty data for its close", async () => {
    const { queue, stale } = setup();
    let finish!: () => void;
    queue.open();
    queue.stopped(
      { Id: "played" },
      700,
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    queue.close();
    const pending = queue.flush();
    queue.open();
    finish();
    await pending;
    expect(stale(["item", "played"])).toBe(false);
    queue.userDataChanged(["other-client"]);
    queue.close();
    await queue.flush();
    expect(stale(["item", "played"])).toBe(true);
    expect(stale(["item", "other-client"])).toBe(true);
  });

  test("a genuine library scan remains dirty while covered", async () => {
    const { queue, stale } = setup();
    queue.open();
    queue.libraryChanged();
    await queue.flush();
    expect(stale(["home", "recentlyAdded"])).toBe(false);
    queue.close();
    await queue.flush();
    expect(stale(["home", "recentlyAdded"])).toBe(true);
    expect(stale(["library-items", "movies"])).toBe(true);
  });

  test("offline close preserves the cached catalog without invalidation", async () => {
    const { queue, stale } = setup();
    onlineManager.setOnline(false);
    queue.open();
    queue.userDataChanged(["played"]);
    queue.close();
    await queue.flush();
    expect(stale(["item", "played"])).toBe(false);
    expect(stale(["home", "continueAndNextUp"])).toBe(false);
  });

  test("an event during a refetch is not lost to cancelRefetch:false", async () => {
    const { client, queue } = setup();
    let finish!: () => void;
    let calls = 0;
    const observer = new QueryObserver(client, {
      queryKey: ["home", "continueAndNextUp"],
      staleTime: Infinity,
      queryFn: async () => {
        calls++;
        if (calls === 1)
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        return { items: calls };
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    queue.userDataChanged();
    const first = queue.flush();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    queue.userDataChanged(["other-client"]);
    finish();
    await first;
    await queue.flush();
    expect(calls).toBe(2);
    unsubscribe();
  });
});
