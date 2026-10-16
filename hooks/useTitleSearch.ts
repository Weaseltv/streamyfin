import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { storage } from "@/utils/mmkv";
import {
  loadIndexedTitles,
  loadTitleIndex,
  parseTitleIndex,
  serializeTitleIndex,
  type TitleEntry,
  type TitleIndex,
} from "@/utils/titleSearch";

/** One member's index at a time, so the device keeps a single copy (~1–2 MB). */
const STORAGE_KEY = "search_title_index";
/** As on the TV: the saved index is used at once and refreshed in the background once it's older than this. */
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

let restored: TitleIndex | undefined;
function readTitleIndex(owner: string) {
  if (restored?.owner !== owner) {
    restored = parseTitleIndex(storage.getString(STORAGE_KEY), owner);
  }
  return restored;
}

/**
 * The member's title index (`utils/titleSearch.ts`), warmed when Search opens
 * rather than at app start. Search never waits on it: until it's loaded the
 * sections show the server's results alone.
 */
export function useTitleIndex(enabled: boolean) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const owner = user?.Id
    ? `${user.ServerId ?? api?.basePath ?? ""}:${user.Id}`
    : null;
  const query = useQuery({
    queryKey: ["search-title-index", owner],
    queryFn: async ({ signal }) => {
      if (!api || !user?.Id || !owner) throw new Error("Not signed in");
      const index: TitleIndex = {
        owner,
        at: Date.now(),
        titles: await loadTitleIndex(api, user.Id, signal),
      };
      storage.set(STORAGE_KEY, serializeTitleIndex(index));
      restored = index;
      return index;
    },
    initialData: () => (owner ? readTitleIndex(owner) : undefined),
    initialDataUpdatedAt: () => (owner ? readTitleIndex(owner)?.at : undefined),
    staleTime: REFRESH_AFTER_MS,
    // Kept in memory for the session; the disk copy is the app-start cache
    gcTime: Number.POSITIVE_INFINITY,
    structuralSharing: false,
    enabled: enabled && !!api && !!owner,
  });

  // Search stays mounted once opened, so coming back to it refreshes an old
  // index too
  const { dataUpdatedAt, refetch } = query;
  useFocusEffect(
    useCallback(() => {
      if (
        enabled &&
        owner &&
        dataUpdatedAt > 0 &&
        Date.now() - dataUpdatedAt > REFRESH_AFTER_MS
      ) {
        void refetch({ cancelRefetch: false });
      }
    }, [enabled, owner, dataUpdatedAt, refetch]),
  );

  return query.data;
}

/**
 * A section's index matches as items, in rank order. A failure leaves the
 * section with the server's results.
 */
export function useIndexedTitles(
  section: string,
  matches: readonly TitleEntry[] | undefined,
  enabled: boolean,
) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const ids = useMemo(() => matches?.map((match) => match.id) ?? [], [matches]);
  return useQuery({
    queryKey: ["search", section, "index", user?.Id, ids.join(",")],
    queryFn: ({ signal }) =>
      api && user?.Id
        ? loadIndexedTitles(api, user.Id, ids, signal)
        : Promise.resolve([]),
    enabled: enabled && ids.length > 0 && !!api && !!user?.Id,
    retry: false,
  });
}
