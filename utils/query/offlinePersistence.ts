import type { QueryKey } from "@tanstack/react-query";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

export const OFFLINE_CACHE_KEY = "REACT_QUERY_OFFLINE_CACHE";
export const OFFLINE_CACHE_LIMITS = {
  characters: 1_000_000,
  queries: 40,
  pages: 2,
  ageMs: 24 * 60 * 60 * 1000,
} as const;

// Download records, files, credentials and music queues have their own stores.
// Keep useful catalog metadata, rather than live sessions, search results,
// playback negotiation, service recommendations or whole-series summaries.
const OFFLINE_ROOTS = new Set([
  "home",
  "item",
  "library",
  "library-items",
  "library-data",
  "library-count",
  "collection",
  "collection-items",
  "favorites",
  "series",
  "seasons",
  "episodes",
  "adjacentItems",
  "nextItem",
  "nextUp",
  "nextUp-all",
  "resumeItems",
  "continueWatching",
  "filters",
  "actor",
  "similarItems",
  "user-views",
  "authUser",
  "jellyfin",
  "cultures",
  "music-album",
  "music-album-tracks",
  "music-albums",
  "music-artist",
  "music-artist-albums",
  "music-artist-top-tracks",
  "music-artists",
  "music-playlist",
  "music-playlist-tracks",
  "music-playlists",
  "music-latest",
  "music-recently-played",
  "music-frequently-played",
]);

export function isOfflineCatalogKey(key: QueryKey) {
  return typeof key[0] === "string" && OFFLINE_ROOTS.has(key[0]);
}

type Query = PersistedClient["clientState"]["queries"][number];
function eligible(query: Query, now: number) {
  return (
    isOfflineCatalogKey(query.queryKey) &&
    query.state.status === "success" &&
    now - query.state.dataUpdatedAt <= OFFLINE_CACHE_LIMITS.ageMs
  );
}
function priority(query: Query) {
  if (
    query.queryKey[0] === "home" &&
    ["continueAndNextUp", "resumeItems", "nextUp-all", "userViews"].includes(
      String(query.queryKey[1]),
    )
  )
    return 0;
  if (query.queryKey[0] === "item" || query.queryKey[0] === "series") return 1;
  if (query.queryKey[0] === "home") return 2;
  return 3;
}
function candidates(client: PersistedClient, now: number) {
  return client.clientState.queries
    .filter((query) => eligible(query, now))
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        b.state.dataUpdatedAt - a.state.dataUpdatedAt,
    );
}
function boundedQuery(query: Query): Query {
  const data = query.state.data as
    | { pages?: unknown[]; pageParams?: unknown[] }
    | undefined;
  if (!Array.isArray(data?.pages) || !Array.isArray(data?.pageParams))
    return query;
  // A contiguous prefix preserves accumulated-item pagination and pageParams.
  // Never truncate an episode/season/album array used for counts or a queue.
  return {
    ...query,
    state: {
      ...query.state,
      data: {
        ...data,
        pages: data.pages.slice(0, OFFLINE_CACHE_LIMITS.pages),
        pageParams: data.pageParams.slice(0, OFFLINE_CACHE_LIMITS.pages),
      },
    },
  };
}

/** Serialize each selected query once, with a hard bound on the final string. */
export function serializeOfflineCache(
  client: PersistedClient,
  now = Date.now(),
) {
  const prefix = `{"timestamp":${JSON.stringify(client.timestamp)},"buster":${JSON.stringify(client.buster)},"clientState":{"mutations":${JSON.stringify(client.clientState.mutations)},"queries":[`;
  const suffix = "]}}";
  let length = prefix.length + suffix.length;
  if (length > OFFLINE_CACHE_LIMITS.characters) return undefined;
  const chunks: string[] = [];
  for (const query of candidates(client, now)) {
    if (chunks.length >= OFFLINE_CACHE_LIMITS.queries) break;
    const chunk = JSON.stringify(boundedQuery(query));
    const cost = chunk.length + (chunks.length ? 1 : 0);
    if (length + cost > OFFLINE_CACHE_LIMITS.characters) continue;
    chunks.push(chunk);
    length += cost;
  }
  return prefix + chunks.join(",") + suffix;
}

interface Storage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
interface PauseGate {
  readonly isHeld: boolean;
  subscribeHold: (listener: (held: boolean) => void) => () => void;
}
interface Options {
  gate?: PauseGate;
  quietMs?: number;
  maxWaitMs?: number;
  scheduleIdle?: (callback: () => void) => () => void;
}

export function createOfflinePersister(
  storage: Storage,
  options: Options = {},
): Persister & {
  flush: () => void;
  dispose: () => void;
} {
  let pending: PersistedClient | undefined;
  let pendingFingerprint: string | undefined;
  let writtenFingerprint: string | undefined;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let cancelIdle: (() => void) | undefined;
  const identities = new WeakMap<object, number>();
  let nextIdentity = 0;
  const fingerprint = (client: PersistedClient) => {
    const queries = candidates(client, Date.now()).map((query) => {
      const data = query.state.data;
      let identity: string | number;
      if (data !== null && typeof data === "object") {
        if (!identities.has(data)) identities.set(data, ++nextIdentity);
        identity = identities.get(data)!;
      } else identity = JSON.stringify(data) ?? "undefined";
      return `${query.queryHash}:${query.state.dataUpdatedAt}:${identity}`;
    });
    return (
      client.buster + JSON.stringify([queries, client.clientState.mutations])
    );
  };
  const cancel = () => {
    clearTimeout(quietTimer);
    clearTimeout(maxTimer);
    cancelIdle?.();
    quietTimer = undefined;
    maxTimer = undefined;
    cancelIdle = undefined;
  };
  const flush = () => {
    cancel();
    if (!pending) return;
    const client = pending;
    const value = serializeOfflineCache(client);
    if (value === undefined) return;
    try {
      storage.setItem(OFFLINE_CACHE_KEY, value);
      writtenFingerprint = pendingFingerprint;
      pending = undefined;
      pendingFingerprint = undefined;
    } catch (error) {
      // Keep the prior valid snapshot if disk/storage is temporarily unavailable.
      console.warn("Offline catalog save failed", error);
    }
  };
  const idleFlush = () => {
    if (options.gate?.isHeld) {
      cancel();
      return;
    }
    cancel();
    if (options.scheduleIdle)
      cancelIdle = options.scheduleIdle(() => {
        cancelIdle = undefined;
        if (!options.gate?.isHeld) flush();
      });
    else flush();
  };
  const schedule = () => {
    if (!pending || options.gate?.isHeld) return;
    clearTimeout(quietTimer);
    cancelIdle?.();
    cancelIdle = undefined;
    quietTimer = setTimeout(idleFlush, options.quietMs ?? 3500);
    if (!maxTimer) maxTimer = setTimeout(idleFlush, options.maxWaitMs ?? 15000);
  };
  const unsubscribe = options.gate?.subscribeHold((held) => {
    if (held) cancel();
    else schedule();
  });
  const removeClient = () => {
    cancel();
    pending = undefined;
    pendingFingerprint = undefined;
    writtenFingerprint = undefined;
    storage.removeItem(OFFLINE_CACHE_KEY);
  };
  return {
    persistClient(client) {
      if (
        !client.clientState.queries.length &&
        !client.clientState.mutations.length
      ) {
        removeClient();
        return;
      }
      const next = fingerprint(client);
      if (next === writtenFingerprint) {
        cancel();
        pending = undefined;
        pendingFingerprint = undefined;
        return;
      }
      pending = client;
      if (next === pendingFingerprint) return; // Fetch-state events do not reset quiet time.
      pendingFingerprint = next;
      schedule();
    },
    restoreClient() {
      const value = storage.getItem(OFFLINE_CACHE_KEY);
      if (!value) return undefined;
      try {
        // Legacy caches migrate once; future writes/reads are capped at 1M.
        if (value.length > 8 * OFFLINE_CACHE_LIMITS.characters) {
          removeClient();
          return undefined;
        }
        const client = JSON.parse(value) as PersistedClient;
        if (
          typeof client.timestamp !== "number" ||
          typeof client.buster !== "string" ||
          !Array.isArray(client.clientState?.queries) ||
          !Array.isArray(client.clientState?.mutations)
        )
          throw new Error("Invalid catalog snapshot");
        if (value.length > OFFLINE_CACHE_LIMITS.characters) {
          const bounded = serializeOfflineCache(client);
          return bounded ? (JSON.parse(bounded) as PersistedClient) : undefined;
        }
        return {
          ...client,
          clientState: {
            ...client.clientState,
            queries: candidates(client, Date.now())
              .slice(0, OFFLINE_CACHE_LIMITS.queries)
              .map(boundedQuery),
          },
        };
      } catch {
        removeClient();
        return undefined;
      }
    },
    removeClient,
    // Foreground saves respect the gate. Explicit background flush finishes
    // the latest snapshot before the process can be killed.
    flush,
    dispose() {
      cancel();
      unsubscribe?.();
    },
  };
}
