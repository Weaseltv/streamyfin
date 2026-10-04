import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import {
  PROGRESSION_QUERY_KEYS,
  playbackRefreshQueue,
} from "@/utils/query/playbackRefresh";

// Returning Home refreshes progression only. LibraryChanged owns catalog changes.
export const HOME_LIBRARY_QUERY_KEYS = PROGRESSION_QUERY_KEYS;

/**
 * Refresh progression on return to Home, or a library's explicitly scoped keys.
 * Catalog changes on Home come from LibraryChanged and manual pull-to-refresh.
 * The Home path joins the playback queue so focus cannot refetch during pop.
 *
 * Skips the refresh on the very first focus (initial mount already fetches) and
 * throttles to avoid refetch storms when quickly switching tabs.
 */
export function useRefreshLibraryOnFocus(
  queryKeys: readonly (readonly unknown[])[] = HOME_LIBRARY_QUERY_KEYS,
  throttleMs = 30_000,
) {
  const queryClient = useNetworkAwareQueryClient();
  const refreshQueue = playbackRefreshQueue(useQueryClient());
  const hasFocusedOnce = useRef(false);
  const lastRefreshRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }

      const now = Date.now();
      if (now - lastRefreshRef.current < throttleMs) {
        return;
      }
      lastRefreshRef.current = now;

      if (queryKeys === HOME_LIBRARY_QUERY_KEYS) {
        refreshQueue.userDataChanged();
        return;
      }
      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    }, [queryClient, queryKeys, throttleMs, refreshQueue]),
  );
}
