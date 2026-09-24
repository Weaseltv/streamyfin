import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";

/**
 * Home's library-dependent queries. Kept in sync with the LibraryChanged
 * handler in WebSocketProvider, minus `library-items`: Home does not show it,
 * and invalidating it refetched every library screen still mounted in the
 * other tab's stack.
 */
export const HOME_LIBRARY_QUERY_KEYS: readonly (readonly unknown[])[] = [
  ["home"],
  ["nextUp-all"],
  ["nextUp"],
  ["resumeItems"],
];

/**
 * Fallback refresh for newly added/removed content.
 *
 * The primary path is the server's `LibraryChanged` WebSocket event (handled in
 * WebSocketProvider). This hook is a safety net for cases where the socket was
 * down or the change happened while the screen was unfocused: when the screen
 * regains focus, it invalidates the library-dependent queries so React Query
 * refetches the latest content.
 *
 * Skips the refresh on the very first focus (initial mount already fetches) and
 * throttles to avoid refetch storms when quickly switching tabs.
 */
export function useRefreshLibraryOnFocus(
  queryKeys: readonly (readonly unknown[])[] = HOME_LIBRARY_QUERY_KEYS,
  throttleMs = 30_000,
) {
  const queryClient = useNetworkAwareQueryClient();
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

      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    }, [queryClient, queryKeys, throttleMs]),
  );
}
