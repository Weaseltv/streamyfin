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
  test("a collection grid saves its first page only, and never one opened at a letter", () => {
    const data = {
      pages: [{ Items: [1, 2] }, { Items: [3, 4] }, { Items: [5, 6] }],
      pageParams: [0, 2, 4],
    };
    const key = (start: number) => [
      "collection-items",
      "server",
      "user",
      "prime",
      true,
      "All",
      [],
      [],
      [],
      ["PremiereDate"],
      ["Descending"],
      start,
    ];
    const client = snapshot([
      { key: key(0), data },
      { key: key(300), data },
    ]);
    const saved = JSON.parse(serializeOfflineCache(client)!);
    expect(saved.clientState.queries).toHaveLength(1);
    expect(saved.clientState.queries[0].queryKey.at(-1)).toBe(0);
    expect(saved.clientState.queries[0].state.data).toEqual({
      pages: data.pages.slice(0, 1),
      pageParams: [0],
    });
    expect(data.pages).toHaveLength(3);
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

describe("what is saved first when the cache is over a limit", () => {
  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  // What Home opens on. Unchanged: always first.
  const top = [
    ["home", "continueAndNextUp"],
    ["home", "resumeItems"],
    ["home", "nextUp-all"],
    ["home", "userViews", "user"],
  ];
  // The rest of the phone's Home.
  const rows = [
    ["home", "recentlyAdded", "movies", "server", "user", "library-1"],
    ["home", "recentlyAdded", "tvshows", "server", "user", "library-2"],
    ["home", "justwatch", "trending_movies", "server", "user"],
    ["home", "justwatch", "trending_shows", "server", "user"],
    ["home", "justwatch", "recently_released", "server", "user"],
    ["home", "justwatch", "movie_roulette", "server", "user"],
    ["home", "streaming", "server", "user"],
    ["home", "nextUpDismissals", "server", "user"],
  ];
  /** Home was loaded two hours ago; every title below was visited since. */
  const home = (keys: string[][], characters = 10) =>
    keys.map((key) => ({
      key,
      data: { padding: "x".repeat(characters) },
      updatedAt: now - 2 * HOUR,
    }));
  /** Title pages and series pages, number 0 the most recent visit. */
  const visited = (count: number, characters = 10) =>
    Array.from({ length: count }, (_, i) => ({
      key: i % 2 ? ["series", `visit-${i}`] : ["item", `visit-${i}`],
      data: { Id: `visit-${i}`, padding: "x".repeat(characters) },
      updatedAt: now - i * 1000,
    }));
  const savedKeys = (value: string | undefined): string[][] =>
    JSON.parse(value!).clientState.queries.map(
      (query: { queryKey: string[] }) => query.queryKey,
    );
  const visits = (keys: string[][]) =>
    keys
      .filter((key) => key[0] === "item" || key[0] === "series")
      .map((key) => Number(key[1].replace("visit-", "")));
  const homeRows = (keys: string[][]) =>
    keys.filter(
      (key) => key[0] === "home" && rows.some((row) => row[1] === key[1]),
    );
  const upTo = (count: number) => Array.from({ length: count }, (_, i) => i);

  test("query limit: all of Home, then the most recent visited titles", () => {
    const client = snapshot([
      ...visited(45),
      { key: ["library-items", "movies"], data: [], updatedAt: now },
      ...home(rows),
      ...home(top),
    ]);
    const keys = savedKeys(serializeOfflineCache(client, now));
    expect(keys).toHaveLength(OFFLINE_CACHE_LIMITS.queries);
    // The top rank is where it was: first, whatever its age
    expect(keys.slice(0, top.length).map((key) => key[1])).toEqual(
      expect.arrayContaining(top.map((key) => key[1])),
    );
    // Every other Home row is saved, although each is older than any visit
    expect(homeRows(keys)).toHaveLength(rows.length);
    // The rest are the most recent visits, with no gap
    const room = OFFLINE_CACHE_LIMITS.queries - top.length - rows.length;
    expect(visits(keys)).toEqual(upTo(room));
    expect(keys.some((key) => key[0] === "library-items")).toBe(false);
  });
  test("query limit: the cost is one of the oldest visited titles for each Home row", () => {
    const client = snapshot([...visited(45), ...home(rows), ...home(top)]);
    const before = savedKeys(
      serializeOfflineCache(client, now, "visitedFirst"),
    );
    const after = savedKeys(serializeOfflineCache(client, now, "homeFirst"));
    // Before: the top rank, then visited titles, and none of Home's other rows
    expect(before.slice(0, top.length).map((key) => key[1])).toEqual(
      expect.arrayContaining(top.map((key) => key[1])),
    );
    expect(homeRows(before)).toHaveLength(0);
    expect(visits(before)).toEqual(
      upTo(OFFLINE_CACHE_LIMITS.queries - top.length),
    );
    // After: the same visits less the oldest, one for each row
    expect(visits(before).length - visits(after).length).toBe(rows.length);
    expect(visits(after)).toEqual(visits(before).slice(0, -rows.length));
  });
  test("query limit: nothing is given up while there is room for everything", () => {
    const client = snapshot([...visited(20), ...home(rows), ...home(top)]);
    const keys = savedKeys(serializeOfflineCache(client, now));
    expect(keys).toHaveLength(20 + rows.length + top.length);
    expect(visits(keys)).toEqual(upTo(20));
  });
  test("character limit: all of Home, then the most recent visited titles that fit", () => {
    // 30 visits of 40,000 characters do not fit in 1,000,000 by themselves
    const client = snapshot([
      ...visited(30, 40_000),
      ...home(rows, 20_000),
      ...home(top, 1_000),
    ]);
    const value = serializeOfflineCache(client, now)!;
    expect(value.length).toBeLessThanOrEqual(OFFLINE_CACHE_LIMITS.characters);
    const keys = savedKeys(value);
    // This is the character limit at work, not the query limit
    expect(keys.length).toBeLessThan(OFFLINE_CACHE_LIMITS.queries);
    expect(keys.slice(0, top.length).map((key) => key[1])).toEqual(
      expect.arrayContaining(top.map((key) => key[1])),
    );
    expect(homeRows(keys)).toHaveLength(rows.length);
    const kept = visits(keys);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(30);
    expect(kept).toEqual(upTo(kept.length));
  });
  test("character limit: before, visited titles took the room and Home's rows lost it", () => {
    const client = snapshot([
      ...visited(30, 40_000),
      ...home(rows, 20_000),
      ...home(top, 1_000),
    ]);
    const before = serializeOfflineCache(client, now, "visitedFirst")!;
    expect(before.length).toBeLessThanOrEqual(OFFLINE_CACHE_LIMITS.characters);
    expect(homeRows(savedKeys(before)).length).toBeLessThan(rows.length);
    const after = savedKeys(serializeOfflineCache(client, now, "homeFirst"));
    expect(visits(after).length).toBeLessThan(visits(savedKeys(before)).length);
  });
  test("a persister saves and restores in its own order, and leaves downloads alone", () => {
    const client = snapshot([...visited(45), ...home(rows), ...home(top)]);
    for (const [order, expected] of [
      [undefined, rows.length],
      ["homeFirst", rows.length],
      ["visitedFirst", 0],
    ] as const) {
      const storage = fakeStorage();
      const persister = makePersister(storage, order ? { order } : {});
      persister.persistClient(client);
      persister.flush();
      expect(
        homeRows(savedKeys(storage.values.get(OFFLINE_CACHE_KEY))),
      ).toHaveLength(expected);
      const restored = persister.restoreClient() as PersistedClient;
      expect(restored.clientState.queries).toHaveLength(
        OFFLINE_CACHE_LIMITS.queries,
      );
      expect(
        homeRows(
          restored.clientState.queries.map(
            (query) => query.queryKey as string[],
          ),
        ),
      ).toHaveLength(expected);
      expect(storage.values.get("download-records")).toBe("authoritative");
    }
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
