import { assertNotAborted } from "@/utils/async/abort";
export const FAVORITES_PREFIX = ["home", "favorites"] as const;

export const favoriteScope = (
  server: string | undefined,
  userId: string | null | undefined,
) => [...FAVORITES_PREFIX, server ?? "", userId ?? ""] as const;

type CountState = { isSuccess: boolean; data?: number };

export function favoriteRailVisible(count: {
  isPending: boolean;
  data?: number;
}) {
  return !count.isPending && count.data !== 0;
}

/** Initial count settlement must never cancel the newly mounted rails. */
export function favoriteCountChanged(
  previous: number | undefined,
  next: CountState,
) {
  return previous !== undefined && next.isSuccess && previous !== next.data;
}

export function favoriteRailNeedsRefresh(
  query: { fetchStatus: string; dataUpdatedAt: number },
  countUpdatedAt: number,
) {
  return query.fetchStatus === "idle" && query.dataUpdatedAt < countUpdatedAt;
}

/** Counts are authoritative only after both endpoints succeed. */
export function favoriteTotals(items: CountState, people: CountState) {
  const ready = items.isSuccess && people.isSuccess;
  const total =
    items.data !== undefined && people.data !== undefined
      ? items.data + people.data
      : undefined;
  return { ready, total, empty: ready && total === 0 };
}

/** One Watchlist's requests, including retries, share two cancellable slots. */
export class FavoriteRequestQueue {
  private active = 0;
  private waiting: (() => void)[] = [];

  async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    assertNotAborted(signal);
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        this.waiting = this.waiting.filter((start) => start !== begin);
        reject(signal.reason ?? new Error("Favourite request cancelled"));
      };
      const begin = () => {
        signal.removeEventListener("abort", abort);
        this.active++;
        resolve();
      };
      if (this.active < 2) begin();
      else {
        this.waiting.push(begin);
        signal.addEventListener("abort", abort, { once: true });
      }
    });
    try {
      assertNotAborted(signal);
      return await work();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
