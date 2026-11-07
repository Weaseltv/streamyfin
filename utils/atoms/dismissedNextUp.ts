import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useEffect, useMemo } from "react";
import { AppState } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { storage } from "../mmkv";
import {
  isDismissed,
  loadDismissals,
  type NextUpDismissals,
  seriesKey,
  setDismissed,
} from "../nextUpDismissals";

type DismissedByUser = Record<string, string[]>;
const mmkvStorage = () => ({
  getItem: (key: string, initialValue: DismissedByUser): DismissedByUser => {
    try {
      return JSON.parse(storage.getString(key) ?? "null") ?? initialValue;
    } catch {
      return initialValue;
    }
  },
  setItem: (key: string, value: DismissedByUser) =>
    storage.set(key, JSON.stringify(value)),
  removeItem: (key: string) => storage.remove(key),
});

// Migration source only. New dismissals live on Jellyfin, not in this atom.
export const dismissedNextUpAtom = atomWithStorage<DismissedByUser>(
  "dismissedNextUpSeries",
  {},
  mmkvStorage(),
  { getOnInit: true },
);
const imported = new WeakMap<object, Set<string>>();

export const useDismissedNextUp = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const byUser = useAtomValue(dismissedNextUpAtom);
  const setByUser = useSetAtom(dismissedNextUpAtom);
  const store = useStore();
  const queryClient = useQueryClient();
  const userId = user?.Id ?? "";
  const queryKey = useMemo(
    () => ["home", "nextUpDismissals", api?.basePath ?? "", userId],
    [api?.basePath, userId],
  );
  const stillOwns = useCallback(
    () => store.get(apiAtom) === api && store.get(userAtom)?.Id === userId,
    [store, api, userId],
  );
  const load = useCallback(async () => {
    if (!api || !userId) return {};
    // Query cancellation does not abort server writes. Check identity before
    // starting and again after migrating, so late results cannot affect a new user.
    if (!stillOwns()) throw new Error("Account changed");
    const migrated = imported.get(api) ?? new Set<string>();
    const legacy = migrated.has(userId)
      ? []
      : (store.get(dismissedNextUpAtom)[userId] ?? []);
    const value = await loadDismissals(api, userId, legacy);
    migrated.add(userId);
    imported.set(api, migrated);
    if (legacy.length) {
      setByUser((previous) => ({
        ...previous,
        [userId]: (previous[userId] ?? []).filter((id) => !legacy.includes(id)),
      }));
    }
    return value;
  }, [api, userId, store, setByUser, stillOwns]);
  const query = useQuery({
    queryKey,
    queryFn: load,
    enabled: !!api && !!userId,
    staleTime: 30_000,
  });
  const refresh = useCallback(async () => {
    const result = await query.refetch();
    if (result.error) throw result.error;
  }, [query.refetch]);
  const change = useCallback(
    async (seriesId: string | null | undefined, dismissed: boolean) => {
      if (!api || !userId || !seriesId) return;
      if (!stillOwns()) throw new Error("Account changed");
      // Finish any legacy import before a restore, so it cannot be re-added later.
      await load();
      if (!stillOwns()) throw new Error("Account changed");
      const value = await setDismissed(api, userId, seriesId, dismissed);
      if (stillOwns())
        queryClient.setQueryData<NextUpDismissals>(queryKey, value);
    },
    [api, userId, load, stillOwns, queryClient, queryKey],
  );
  const dismiss = useCallback((id: string) => change(id, true), [change]);
  const undismiss = useCallback(
    (id: string | null | undefined) => change(id, false),
    [change],
  );
  const dismissed = useMemo(
    () =>
      new Set([
        ...Object.keys(query.data ?? {}),
        ...(byUser[userId] ?? []).map(seriesKey),
      ]),
    [query.data, byUser, userId],
  );
  const excludeItem = useCallback(
    (item: BaseItemDto) => {
      if (isDismissed(item, query.data ?? {})) return true;
      return (
        item.Type === "Episode" &&
        !!item.SeriesId &&
        (byUser[userId] ?? []).some(
          (id) => seriesKey(id) === seriesKey(item.SeriesId!),
        )
      );
    },
    [query.data, byUser, userId],
  );
  return { dismissed, dismiss, undismiss, excludeItem, refresh };
};

/** Home owns one foreground subscription; other hook callers share its query. */
export function useRefreshDismissedNextUp(active: boolean) {
  const { refresh } = useDismissedNextUp();
  useEffect(() => {
    if (!active) return;
    const run = () => {
      if (AppState.currentState === "active") void refresh().catch(() => {});
    };
    run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    const timer = setInterval(run, 30_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [active, refresh]);
}
