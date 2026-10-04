import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  onlineManager,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

export const PROGRESSION_QUERY_KEYS = [
  ["home", "continueAndNextUp"],
  ["home", "resumeItems"],
  ["home", "nextUp-all"],
  ["home", "hero"],
  ["home", "heroItems"],
  ["resumeItems"],
  ["continueWatching"],
  ["nextUp-all"],
  ["nextUp"],
] as const;

const LIBRARY_ROOTS = new Set([
  "home",
  "library-items",
  "nextUp-all",
  "nextUp",
  "resumeItems",
  "seasons",
  "episodes",
]);
const SERIES_ROOTS = new Set(["series", "seasons", "episodes", "AllEpisodes"]);

export function isItemMetadataKey(key: QueryKey, itemIds: ReadonlySet<string>) {
  if (key[0] !== "item" || typeof key[1] !== "string" || !itemIds.has(key[1]))
    return false;
  // People-only queries cannot change when playback progress changes.
  const fields = key[2];
  return !(
    Array.isArray(fields) &&
    fields.length === 1 &&
    fields[0] === "People"
  );
}

/** One queue per real QueryClient, shared by navigation and WebSocket echoes. */
export class PlaybackRefreshQueue {
  private held = false;
  private holdListeners = new Set<(held: boolean) => void>();
  get isHeld() {
    return this.held;
  }
  subscribeHold(listener: (held: boolean) => void) {
    this.holdListeners.add(listener);
    return () => {
      this.holdListeners.delete(listener);
    };
  }
  private draining = false;
  private progression = false;
  private library = false;
  private itemIds = new Set<string>();
  private seriesIds = new Set<string>();
  private reports = new Set<Promise<unknown>>();
  private downloadSync = new Map<string, () => Promise<unknown>>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private client: QueryClient) {}

  open() {
    this.held = true;
    for (const listener of this.holdListeners) listener(true);
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Called by the outer native stack's closing transitionEnd, not focus. */
  close() {
    this.held = false;
    for (const listener of this.holdListeners) listener(false);
    // Give the stop echo the same quiet window as other UserDataChanged bursts.
    this.schedule();
  }

  userDataChanged(ids: readonly string[] = []) {
    this.progression = true;
    for (const id of ids) {
      this.itemIds.add(id);
      for (const [, item] of this.client.getQueriesData<BaseItemDto>({
        queryKey: ["item", id],
      })) {
        if (item?.SeriesId) this.seriesIds.add(item.SeriesId);
      }
    }
    this.schedule();
  }

  libraryChanged() {
    this.library = true;
    this.schedule(1000);
  }

  stopped(
    item: BaseItemDto,
    positionTicks: number,
    report: Promise<unknown>,
    sync?: () => Promise<unknown>,
  ) {
    if (!item.Id) return;
    this.userDataChanged([item.Id]);
    if (item.SeriesId) this.seriesIds.add(item.SeriesId);
    this.reports.add(report);
    if (sync) this.downloadSync.set(item.Id, sync);
    const ids = new Set([item.Id]);
    this.client.setQueriesData<BaseItemDto>(
      {
        predicate: (query) => isItemMetadataKey(query.queryKey, ids),
      },
      (cached) =>
        cached
          ? {
              ...cached,
              UserData: {
                ...cached.UserData,
                PlaybackPositionTicks: positionTicks,
              },
            }
          : cached,
    );
  }

  private schedule(delay = 800) {
    if (this.held || this.draining) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch((error) => {
        console.error("Playback refresh failed", error);
      });
    }, delay);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.held || this.draining) return;
    if (
      !this.progression &&
      !this.library &&
      !this.itemIds.size &&
      !this.reports.size &&
      !this.downloadSync.size
    )
      return;
    this.draining = true;
    try {
      // Reporting starts at stop; download reconciliation starts after the
      // transition. Both transports have deadlines and neither blocks pop.
      const reports = [...this.reports];
      this.reports.clear();
      await Promise.allSettled(reports);
      if (this.held) return;
      // Read the server after its stop report, avoiding reconciliation against
      // a resume position that the report is still changing.
      const syncs = [...this.downloadSync.values()];
      this.downloadSync.clear();
      await Promise.allSettled(
        syncs.map(async (sync) => {
          await sync();
        }),
      );
      if (this.held) return;
      const progression = this.progression;
      const library = this.library;
      const ids = this.itemIds;
      const series = this.seriesIds;
      this.progression = false;
      this.library = false;
      this.itemIds = new Set();
      this.seriesIds = new Set();
      if (!onlineManager.isOnline()) return;
      await this.client.invalidateQueries(
        {
          predicate: (query) => {
            const key = query.queryKey;
            return (
              (library && LIBRARY_ROOTS.has(String(key[0]))) ||
              (progression &&
                PROGRESSION_QUERY_KEYS.some((prefix) =>
                  prefix.every((part, index) => key[index] === part),
                )) ||
              isItemMetadataKey(key, ids) ||
              (SERIES_ROOTS.has(String(key[0])) &&
                typeof key[1] === "string" &&
                series.has(key[1]))
            );
          },
        },
        { cancelRefetch: false },
      );
    } finally {
      this.draining = false;
      // Events received during an in-flight refresh need a trailing refresh;
      // do not lose another client's update to cancelRefetch:false.
      if (
        this.progression ||
        this.library ||
        this.itemIds.size ||
        this.reports.size ||
        this.downloadSync.size
      )
        this.schedule();
    }
  }
}

const queues = new WeakMap<QueryClient, PlaybackRefreshQueue>();
export function playbackRefreshQueue(client: QueryClient) {
  let queue = queues.get(client);
  if (!queue) {
    queue = new PlaybackRefreshQueue(client);
    queues.set(client, queue);
  }
  return queue;
}
