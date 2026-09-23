import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

/**
 * Optimistic favourite state, shared so a toggle in one place is reflected
 * everywhere the item appears. Keyed `userId:itemId` so a different account
 * can never read the previous one's entries.
 *
 * Consumers must NOT subscribe to this map directly: every mounted card uses
 * this hook, so a whole-map subscription re-rendered every card on every
 * toggle. Read through a per-item selector instead (see below).
 */
const favoritesAtom = atom<Record<string, boolean>>({});

export const useFavorite = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  // Write-only: subscribing here would defeat the per-item selector below.
  const setFavorites = useSetAtom(favoritesAtom);

  const itemId = item.Id ?? "";
  const entryKey = itemId && user?.Id ? `${user.Id}:${itemId}` : "";

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

  // Use refs to avoid stale closure issues in mutationFn
  const itemRef = useRef(item);
  const apiRef = useRef(api);
  const userRef = useRef(user);

  // Keep refs updated
  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const itemQueryKeyPrefix = useMemo(
    () => ["item", item.Id] as const,
    [item.Id],
  );

  const updateItemInQueries = useCallback(
    (newData: Partial<BaseItemDto>) => {
      queryClient.setQueriesData<BaseItemDto | null | undefined>(
        { queryKey: itemQueryKeyPrefix },
        (old) => {
          if (!old) return old;
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
    mutationFn: async (nextIsFavorite: boolean) => {
      const currentApi = apiRef.current;
      const currentUser = userRef.current;
      const currentItem = itemRef.current;

      if (!currentApi || !currentUser?.Id || !currentItem?.Id) {
        return;
      }

      // Use the same endpoint format as the web client:
      // POST /Users/{userId}/FavoriteItems/{itemId} - add favorite
      // DELETE /Users/{userId}/FavoriteItems/{itemId} - remove favorite
      const path = `/Users/${currentUser.Id}/FavoriteItems/${currentItem.Id}`;

      const response = nextIsFavorite
        ? await currentApi.post(path, {}, {})
        : await currentApi.delete(path, {});
      return response.data;
    },
    onMutate: async (nextIsFavorite: boolean) => {
      await queryClient.cancelQueries({ queryKey: itemQueryKeyPrefix });

      const previousIsFavorite = isFavorite;
      const previousQueries = queryClient.getQueriesData<BaseItemDto | null>({
        queryKey: itemQueryKeyPrefix,
      });

      setIsFavorite(nextIsFavorite);
      updateItemInQueries({ UserData: { IsFavorite: nextIsFavorite } });

      return { previousIsFavorite, previousQueries };
    },
    onError: (_err, _nextIsFavorite, context) => {
      if (context?.previousQueries) {
        for (const [queryKey, data] of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      setIsFavorite(context?.previousIsFavorite);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: itemQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: ["home", "favorites"] });
    },
  });

  const toggleFavorite = useCallback(() => {
    favoriteMutation.mutate(!isFavorite);
  }, [favoriteMutation, isFavorite]);

  return {
    isFavorite,
    toggleFavorite,
    favoriteMutation,
  };
};
