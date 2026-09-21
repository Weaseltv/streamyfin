import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue, useSetAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useMemo } from "react";
import { userAtom } from "@/providers/JellyfinProvider";
import { storage } from "../mmkv";

/**
 * Series the user has removed from the Continue & Next Up / Next Up rails.
 *
 * Jellyfin computes Next Up per series — the first unwatched episode after the
 * last one you watched — and offers no way to exclude a series. Marking that
 * episode "not played" does not help: it stays the next unwatched one, and
 * clearing its resume point actually *moves* it from the Resume feed into the
 * Next Up feed. So the only honest fix is client-side.
 *
 * Keyed per user so accounts on one device do not share a dismissal list.
 * A dismissal is lifted automatically the moment the user re-engages with the
 * series (plays or marks something played), so it never has to be undone by
 * hand.
 */
type DismissedByUser = Record<string, string[]>;

const mmkvStorage = () => ({
  getItem: (key: string, initialValue: DismissedByUser): DismissedByUser => {
    const value = storage.getString(key);
    if (value == null) return initialValue;
    try {
      return JSON.parse(value) as DismissedByUser;
    } catch {
      return initialValue;
    }
  },
  setItem: (key: string, value: DismissedByUser) => {
    storage.set(key, JSON.stringify(value));
  },
  removeItem: (key: string) => {
    storage.remove(key);
  },
});

export const dismissedNextUpAtom = atomWithStorage<DismissedByUser>(
  "dismissedNextUpSeries",
  {},
  mmkvStorage(),
);

export const useDismissedNextUp = () => {
  const user = useAtomValue(userAtom);
  const byUser = useAtomValue(dismissedNextUpAtom);
  const setByUser = useSetAtom(dismissedNextUpAtom);
  const userId = user?.Id ?? "";

  const dismissed = useMemo(
    () => new Set(userId ? (byUser[userId] ?? []) : []),
    [byUser, userId],
  );

  const dismiss = useCallback(
    (seriesId: string) => {
      if (!userId || !seriesId) return;
      setByUser((prev) => {
        const current = prev[userId] ?? [];
        if (current.includes(seriesId)) return prev;
        return { ...prev, [userId]: [...current, seriesId] };
      });
    },
    [setByUser, userId],
  );

  const undismiss = useCallback(
    (seriesId: string | null | undefined) => {
      if (!userId || !seriesId) return;
      setByUser((prev) => {
        const current = prev[userId];
        if (!current?.includes(seriesId)) return prev;
        return { ...prev, [userId]: current.filter((id) => id !== seriesId) };
      });
    },
    [setByUser, userId],
  );

  /**
   * Rail filter. Stable while the dismissal set is unchanged, so rails only
   * re-filter when a dismissal actually happens.
   */
  const excludeItem = useCallback(
    (item: BaseItemDto) =>
      item.Type === "Episode" &&
      !!item.SeriesId &&
      dismissed.has(item.SeriesId),
    [dismissed],
  );

  return { dismissed, dismiss, undismiss, excludeItem };
};
