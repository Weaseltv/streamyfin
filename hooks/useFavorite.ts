import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { FAVORITES_PREFIX } from "@/utils/query/favorites";

/**
 * Optimistic favourite state, shared so a toggle in one place is reflected
 * everywhere the item appears. Keyed by server, user and item so an account
 * can never read the previous one's entries.
 *
 * Consumers must NOT subscribe to this map directly: every mounted card uses
 * this hook, so a whole-map subscription re-rendered every card on every
 * toggle. Read through a per-item selector instead (see below).
 */
const favoritesAtom = atom<Record<string, boolean>>({});

export const useFavorite = (item: BaseItemDto, forceNetwork = false) => {
  const queryClient = useQueryClient();
  const atomStore = useStore();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  // Write-only: subscribing here would defeat the per-item selector below.
  const setFavorites = useSetAtom(favoritesAtom);

  const itemId = item.Id ?? "";
  const entryKey =
    itemId && user?.Id
      ? `${user.ServerId || api?.basePath}:${user.Id}:${itemId}`
      : "";

  // Derived per item, so this consumer only re-renders when *its* entry
  // changes. Created in a useMemo rather than a module-level registry: the
  // atom lives and dies with the component, so browsing thousands of items
  // cannot accumulate selector atoms.
  const entryAtom = useMemo(
    () => selectAtom(favoritesAtom, (map) => map[entryKey]),
    [entryKey],
  );
  const optimisticIsFavorite = useAtomValue(entryAtom);

  // Optimistic state wins; otherwise fall back to what the item carries.
  const isFavorite = entryKey
    ? (optimisticIsFavorite ?? item.UserData?.IsFavorite)
    : item.UserData?.IsFavorite;

  // Update shared state when item data changes
  useEffect(() => {
    const next = item.UserData?.IsFavorite;
    if (!entryKey || next === undefined) return;
    setFavorites((prev) =>
      // Returning `prev` unchanged makes Jotai skip the update entirely. The
      // unconditional spread this replaces produced a fresh map on every
      // mount, so a screenful of cards re-rendered each other on arrival.
      prev[entryKey] === next ? prev : { ...prev, [entryKey]: next },
    );
  }, [entryKey, item.UserData?.IsFavorite, setFavorites]);

  // Helper to update favorite status in shared state
  const setIsFavorite = useCallback(
    (value: boolean | undefined) => {
      if (!entryKey || value === undefined) return;
      setFavorites((prev) =>
        prev[entryKey] === value ? prev : { ...prev, [entryKey]: value },
      );
    },
    [entryKey, setFavorites],
  );

  const currentScope = useRef({ entryKey, api });
  currentScope.current = { entryKey, api };
  const snapshot = () => ({
    entryKey,
    api,
    user,
    item,
    previousIsFavorite: isFavorite,
  });
  type FavoriteRequest = {
    nextIsFavorite: boolean;
    scope: ReturnType<typeof snapshot>;
  };
  const isCurrent = ({ scope }: FavoriteRequest) =>
    scope.entryKey === currentScope.current.entryKey &&
    scope.api === currentScope.current.api &&
    atomStore.get(apiAtom) === scope.api &&
    atomStore.get(userAtom)?.Id === scope.user?.Id;

  const itemQueryKeyPrefix = useMemo(
    () => ["item", item.Id] as const,
    [item.Id],
  );

  const updateItemInQueries = useCallback(
    (newData: Partial<BaseItemDto>) => {
      queryClient.setQueriesData<BaseItemDto | null | undefined>(
        { queryKey: itemQueryKeyPrefix },
        (old) => {
          // The prefix also matches ["item", id, "people"], whose data is an
          // array. Spreading that into an object destroyed the cast list, so
          // the rail emptied and reloaded on every toggle. Only patch caches
          // that actually hold an item.
          if (!old || Array.isArray(old)) return old;
          return {
            ...old,
            ...newData,
            UserData: { ...old.UserData, ...newData.UserData },
          };
        },
      );
    },
    [itemQueryKeyPrefix, queryClient],
  );

  const favoriteMutation = useMutation({
    networkMode: forceNetwork ? "always" : undefined,
    mutationFn: async (request: FavoriteRequest) => {
      const {
        api: currentApi,
        user: currentUser,
        item: currentItem,
      } = request.scope;
      if (
        !isCurrent(request) ||
        !currentApi ||
        !currentUser?.Id ||
        !currentItem?.Id
      )
        throw new Error("favorite_session_obsolete");
      const { nextIsFavorite } = request;

      // Use the same endpoint format as the web client:
      // POST /Users/{userId}/FavoriteItems/{itemId} - add favorite
      // DELETE /Users/{userId}/FavoriteItems/{itemId} - remove favorite
      const path = `/Users/${currentUser.Id}/FavoriteItems/${currentItem.Id}`;

      const response = nextIsFavorite
        ? await currentApi.post(path, {}, {})
        : await currentApi.delete(path, {});
      return response.data;
    },
    onMutate: async (request: FavoriteRequest) => {
      const { nextIsFavorite } = request;
      await queryClient.cancelQueries({ queryKey: itemQueryKeyPrefix });

      if (!isCurrent(request)) return undefined;
      const previousIsFavorite = request.scope.previousIsFavorite;
      const previousQueries = queryClient.getQueriesData<BaseItemDto | null>({
        queryKey: itemQueryKeyPrefix,
      });

      setIsFavorite(nextIsFavorite);
      updateItemInQueries({ UserData: { IsFavorite: nextIsFavorite } });

      return { previousIsFavorite, previousQueries };
    },
    onError: (_err, request, context) => {
      if (!isCurrent(request)) return;
      if (context?.previousQueries) {
        for (const [queryKey, data] of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      setIsFavorite(context?.previousIsFavorite);
    },
    onSettled: (_data, _error, request) => {
      if (!isCurrent(request)) return;
      queryClient.invalidateQueries({ queryKey: itemQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: FAVORITES_PREFIX });
    },
  });

  const toggleFavorite = useCallback(() => {
    favoriteMutation.mutate({ nextIsFavorite: !isFavorite, scope: snapshot() });
  }, [favoriteMutation, isFavorite]);

  return {
    isFavorite,
    toggleFavorite,
    favoriteMutation: {
      ...favoriteMutation,
      mutate: (nextIsFavorite: boolean) =>
        favoriteMutation.mutate({ nextIsFavorite, scope: snapshot() }),
      mutateAsync: (nextIsFavorite: boolean) =>
        favoriteMutation.mutateAsync({ nextIsFavorite, scope: snapshot() }),
    },
  };
};
