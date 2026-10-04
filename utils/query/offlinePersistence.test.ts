import { afterEach, describe, expect, test } from "bun:test";
import { dehydrate, QueryClient } from "@tanstack/query-core";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import {
  createOfflinePersister,
  OFFLINE_CACHE_KEY,
  OFFLINE_CACHE_LIMITS,
  serializeOfflineCache,
} from "./offlinePersistence";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers) dispose();
  disposers.length = 0;
});
const snapshot = (
  entries: { key: unknown[]; data: unknown; updatedAt?: number }[],
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  for (const entry of entries)
    client.setQueryData(entry.key, entry.data, {
      updatedAt: entry.updatedAt ?? Date.now(),
    });
  return {
    timestamp: Date.now(),
    buster: "",
    clientState: dehydrate(client),
  } satisfies PersistedClient;
};
const fakeStorage = () => {
  const values = new Map<string, string>([
    ["download-records", "authoritative"],
  ]);
  let writes = 0;
  return {
    values,
    get writes() {
      return writes;
    },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes++;
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};
const makePersister = (
  storage: ReturnType<typeof fakeStorage>,
  options: Parameters<typeof createOfflinePersister>[1] = {},
) => {
  const persister = createOfflinePersister(storage, options);
  disposers.push(persister.dispose);
  return persister;
};
const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const gate = () => {
  const listeners = new Set<(held: boolean) => void>();
  return {
    isHeld: false,
    subscribeHold(listener: (held: boolean) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(held: boolean) {
      this.isHeld = held;
      for (const listener of listeners) listener(held);
    },
  };
};

describe("bounded offline snapshot", () => {
  test("keeps a contiguous page prefix without mutating the live cache", () => {
    const data = {
      pages: [{ Items: [1, 2] }, { Items: [3, 4] }, { Items: [5, 6] }],
      pageParams: [0, 2, 4],
    };
    const client = snapshot([{ key: ["library-items", "movies"], data }]);
    const saved = JSON.parse(serializeOfflineCache(client)!);
    expect(saved.clientState.queries[0].state.data).toEqual({
      pages: data.pages.slice(0, 2),
      pageParams: [0, 2],
    });
    expect(data.pages).toHaveLength(3);
    expect(client.clientState.queries[0].state.data).toBe(data);
  });
  test("allowlist excludes live services, session polling and whole-series summaries", () => {
    const client = snapshot(
      [
        "item",
        "home",
        "search",
        "allSessions",
        "streamystats",
        "jellyseerr",
        "AllEpisodes",
        "unreviewed-root",
      ].map((root) => ({ key: [root, "id"], data: [] })),
    );
    const saved = JSON.parse(serializeOfflineCache(client)!);
    expect(
      saved.clientState.queries
        .map((query: { queryKey: string[] }) => query.queryKey[0])
        .sort(),
    ).toEqual(["home", "item"]);
  });
  test("caps total characters, query count and retention", () => {
    const entries = Array.from({ length: 80 }, (_, i) => ({
      key: ["item", String(i)],
      data: { Id: i, padding: "x".repeat(35000) },
    }));
    entries.push({
      key: ["item", "too-large"],
      data: { Id: 100, padding: "x".repeat(1_100_000) },
    });
    const client = snapshot([
      ...entries,
      {
        key: ["item", "expired"],
        data: 1,
        updatedAt: Date.now() - OFFLINE_CACHE_LIMITS.ageMs - 100,
      },
    ]);
    const value = serializeOfflineCache(client)!;
    expect(value.length).toBeLessThanOrEqual(OFFLINE_CACHE_LIMITS.characters);
    const saved = JSON.parse(value);
    expect(saved.clientState.queries.length).toBeLessThanOrEqual(
      OFFLINE_CACHE_LIMITS.queries,
    );
    expect(
      saved.clientState.queries.some((query: { queryKey: string[] }) =>
        ["too-large", "expired"].includes(query.queryKey[1]),
      ),
    ).toBe(false);
  });
  test("does not truncate a season or album array", () => {
    const seasons = Array.from({ length: 80 }, (_, i) => ({ Id: i }));
    const saved = JSON.parse(
      serializeOfflineCache(
        snapshot([{ key: ["seasons", "show"], data: seasons }]),
      )!,
    );
    expect(saved.clientState.queries[0].state.data).toEqual(seasons);
  });
  test("migrates an old large cache and preserves paused mutations", () => {
    const storage = fakeStorage();
    const client = snapshot(
      Array.from({ length: 50 }, (_, i) => ({
        key: ["item", String(i)],
        data: "x".repeat(25000),
      })),
    );
    client.clientState.mutations = [
      {
        mutationKey: ["favorite"],
        state: {
          isPaused: true,
          status: "pending",
          variables: { itemId: "one" },
        },
      } as PersistedClient["clientState"]["mutations"][number],
    ];
    storage.values.set(OFFLINE_CACHE_KEY, JSON.stringify(client));
    const persister = makePersister(storage);
    const restored = persister.restoreClient() as PersistedClient;
    expect(restored.clientState.queries.length).toBeLessThanOrEqual(40);
    expect(restored.clientState.mutations).toEqual(
      client.clientState.mutations,
    );
    expect(storage.values.get("download-records")).toBe("authoritative");
  });
});

describe("persistence pacing and cancellation", () => {
  test("coalesces changed responses and ignores fetch-state-only events", async () => {
    const storage = fakeStorage();
    const persister = makePersister(storage, { quietMs: 15, maxWaitMs: 100 });
    const first = snapshot([{ key: ["item", "one"], data: { progress: 1 } }]);
    persister.persistClient(first);
    persister.persistClient({ ...first, timestamp: Date.now() + 1 });
    persister.persistClient(
      snapshot([{ key: ["item", "one"], data: { progress: 2 } }]),
    );
    await tick(35);
    expect(storage.writes).toBe(1);
    const restored = persister.restoreClient() as PersistedClient;
    expect(restored.clientState.queries[0].state.data).toEqual({ progress: 2 });
    const same = snapshot([{ key: ["item", "same"], data: { progress: 3 } }]);
    persister.persistClient(same);
    persister.flush();
    persister.persistClient({ ...same, timestamp: Date.now() + 1 });
    await tick(35);
    expect(storage.writes).toBe(2);
  });
  test("holds writes through playback and the closing transition", async () => {
    const storage = fakeStorage();
    const pause = gate();
    const persister = makePersister(storage, { gate: pause, quietMs: 5 });
    pause.set(true);
    persister.persistClient(snapshot([{ key: ["item", "one"], data: 1 }]));
    await tick(15);
    expect(storage.writes).toBe(0);
    pause.set(false);
    await tick(20);
    expect(storage.writes).toBe(1);
  });
  test("removeClient cancels delayed and idle writes instead of resurrecting logout data", async () => {
    const storage = fakeStorage();
    let idle: (() => void) | undefined;
    const persister = makePersister(storage, {
      quietMs: 5,
      scheduleIdle: (callback) => {
        idle = callback;
        return () => {
          idle = undefined;
        };
      },
    });
    persister.persistClient(snapshot([{ key: ["item", "one"], data: 1 }]));
    await tick(15);
    expect(idle).toBeDefined();
    persister.removeClient();
    idle?.();
    await tick(15);
    expect(storage.values.has(OFFLINE_CACHE_KEY)).toBe(false);
    expect(storage.writes).toBe(0);
    expect(storage.values.get("download-records")).toBe("authoritative");
  });
  test("a background flush saves immediately even while playback is held", () => {
    const storage = fakeStorage();
    const pause = gate();
    const persister = makePersister(storage, { gate: pause });
    pause.set(true);
    persister.persistClient(snapshot([{ key: ["item", "one"], data: 1 }]));
    persister.flush();
    expect(storage.writes).toBe(1);
  });
  test("corrupt snapshots clear only the query-cache key", () => {
    const storage = fakeStorage();
    storage.values.set(OFFLINE_CACHE_KEY, "not-json");
    expect(makePersister(storage).restoreClient()).toBeUndefined();
    expect(storage.values.get("download-records")).toBe("authoritative");
  });
});
