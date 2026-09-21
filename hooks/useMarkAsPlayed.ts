import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useDismissedNextUp } from "@/utils/atoms/dismissedNextUp";
import { useHaptic } from "./useHaptic";
import { usePlaybackManager } from "./usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";

export const useMarkAsPlayed = (items: BaseItemDto[]) => {
  const queryClient = useQueryClient();
  const lightHapticFeedback = useHaptic("light");
  const { markItemPlayed, markItemUnplayed } = usePlaybackManager();
  const invalidatePlaybackProgressCache = useInvalidatePlaybackProgressCache();
  const { undismiss: undismissSeriesFromNextUp } = useDismissedNextUp();

  const toggle = useCallback(
    async (played: boolean) => {
      lightHapticFeedback();

      // Marking an episode played is the user re-engaging with the series, so
      // a dismissal from the Continue & Next Up rail no longer applies.
      if (played) {
        for (const item of items) {
          if (item.Type === "Episode") undismissSeriesFromNextUp(item.SeriesId);
        }
      }

      const itemIds = items.map((item) => item.Id).filter(Boolean) as string[];

      const previousQueriesByItemId = itemIds.map((itemId) => ({
        itemId,
        queries: queryClient.getQueriesData<BaseItemDto | null>({
          queryKey: ["item", itemId],
        }),
      }));

      for (const itemId of itemIds) {
        queryClient.setQueriesData<BaseItemDto | null | undefined>(
          { queryKey: ["item", itemId] },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              UserData: {
                ...old.UserData,
                Played: played,
                PlaybackPositionTicks: 0,
                PlayedPercentage: 0,
              },
            };
          },
        );
      }

      // Process all items
      try {
        await Promise.all(
          items.map((item) => {
            if (!item.Id) return Promise.resolve();
            return played ? markItemPlayed(item.Id) : markItemUnplayed(item.Id);
          }),
        );
      } catch (_error) {
        for (const { queries } of previousQueriesByItemId) {
          for (const [queryKey, data] of queries) {
            queryClient.setQueryData(queryKey, data);
          }
        }
      } finally {
        await invalidatePlaybackProgressCache();
        for (const itemId of itemIds) {
          queryClient.invalidateQueries({ queryKey: ["item", itemId] });
        }
      }
    },
    [
      invalidatePlaybackProgressCache,
      items,
      lightHapticFeedback,
      markItemPlayed,
      markItemUnplayed,
      queryClient,
      undismissSeriesFromNextUp,
    ],
  );

  return toggle;
};
