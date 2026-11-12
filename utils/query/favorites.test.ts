import { describe, expect, test } from "bun:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { AbortController as NativeAbortController } from "abort-controller/dist/abort-controller";
import {
  FavoriteRequestQueue,
  favoriteCountChanged,
  favoriteRailNeedsRefresh,
  favoriteRailVisible,
  favoriteScope,
  favoriteTotals,
} from "./favorites";

describe("Watchlist query lifecycle", () => {
  test("initial settlement does not invalidate; only changed settled counts do", () => {
    expect(favoriteCountChanged(undefined, { isSuccess: true, data: 3 })).toBe(
      false,
    );
    expect(favoriteCountChanged(3, { isSuccess: true, data: 3 })).toBe(false);
    expect(favoriteCountChanged(3, { isSuccess: true, data: 4 })).toBe(true);
    expect(favoriteCountChanged(3, { isSuccess: false, data: 4 })).toBe(false);
    expect(
      favoriteRailNeedsRefresh(
        { fetchStatus: "fetching", dataUpdatedAt: 1 },
        5,
      ),
    ).toBe(false);
    expect(
      favoriteRailNeedsRefresh({ fetchStatus: "idle", dataUpdatedAt: 6 }, 5),
    ).toBe(false);
    expect(
      favoriteRailNeedsRefresh({ fetchStatus: "idle", dataUpdatedAt: 1 }, 5),
    ).toBe(true);
  });
  test("failed refresh retains zero gating and people-only mounts only people", () => {
    expect(favoriteRailVisible({ isPending: false, data: 0 })).toBe(false);
    expect(favoriteRailVisible({ isPending: true })).toBe(false);
    expect(favoriteRailVisible({ isPending: false })).toBe(true);
    expect(favoriteRailVisible({ isPending: false, data: 3 })).toBe(true);
  });
  test("people count, failed counts and empty totals stay distinct", () => {
    expect(
      favoriteTotals(
        { isSuccess: true, data: 0 },
        { isSuccess: true, data: 3 },
      ),
    ).toEqual({ ready: true, total: 3, empty: false });
    expect(
      favoriteTotals({ isSuccess: true, data: 0 }, { isSuccess: true, data: 0 })
        .empty,
    ).toBe(true);
    expect(
      favoriteTotals({ isSuccess: false }, { isSuccess: true, data: 0 }).empty,
    ).toBe(false);
  });

  test("cached empty rails survive remount without executing their query function", async () => {
    const client = new QueryClient();
    let calls = 0;
    const options = {
      queryKey: [...favoriteScope("server", "user"), "rail", "Movie"],
      queryFn: async () => {
        calls++;
        return [];
      },
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      staleTime: 60_000,
    };
    const first = new InfiniteQueryObserver(client, options);
    const unsubscribe = first.subscribe(() => {});
    await first.refetch();
    unsubscribe();
    const before = calls;
    const second = new InfiniteQueryObserver(client, options);
    const off = second.subscribe(() => {});
    expect(second.getCurrentResult().data?.pages).toEqual([[]]);
    expect(second.getCurrentResult().isSuccess).toBe(true);
    expect(calls).toBe(before);
    off();
    client.clear();
  });

  test("invalidation includes overview and See all while accounts stay separate", async () => {
    const client = new QueryClient();
    const scope = favoriteScope("server", "user");
    const keys = [
      [...scope, "count"],
      [...scope, "rail", "Movie"],
      [...scope, "see-all", "Movie"],
    ];
    for (const key of keys) client.setQueryData(key, []);
    const other = [...favoriteScope("other-server", "user"), "count"];
    client.setQueryData(other, 5);
    await client.invalidateQueries({ queryKey: scope });
    for (const key of keys)
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    client.clear();
  });

  test("two requests run at once, and failure/cancel do not strand the queue", async () => {
    const queue = new FavoriteRequestQueue();
    const pending: (() => void)[] = [];
    let active = 0;
    let maximum = 0;
    const controllers = Array.from(
      { length: 7 },
      () => new (NativeAbortController as unknown as typeof AbortController)(),
    );
    const requests = controllers.map((controller, index) =>
      queue
        .run(controller.signal, async () => {
          active++;
          maximum = Math.max(maximum, active);
          await new Promise<void>((resolve) => pending.push(resolve));
          active--;
          if (index === 0) throw new Error("endpoint failed");
          return index;
        })
        .catch(() => -1),
    );
    await Promise.resolve();
    expect(active).toBe(2);
    controllers[2].abort();
    for (let pass = 0; pass < 7; pass++) {
      for (const resolve of pending.splice(0)) resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const results = await Promise.all(requests);
    expect(maximum).toBe(2);
    expect(results).toEqual([-1, 1, -1, 3, 4, 5, 6]);
    expect(active).toBe(0);
  });
});
