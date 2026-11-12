import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { Freshness } from "@/constants/queryFreshness";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { buildOfflineSeasons } from "@/utils/downloads/offline-series";

/**
 * A show's season list. It needs only the show's id, so the show page asks
 * for it together with the show (`silent`: started, never re-rendering the
 * caller) and the season picker reads the same request when it mounts.
 */
export function useSeriesSeasons(
  seriesId: string | null | undefined,
  isOffline: boolean,
  options: { enabled?: boolean; silent?: boolean } = {},
) {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItems, downloadedItems } = useDownload();

  // Online queries must not depend on the download count: see series/[id].
  const offlineRevision = isOffline ? downloadedItems.length : 0;

  return useQuery({
    queryKey: ["seasons", seriesId, isOffline, offlineRevision],
    queryFn: async (context) => {
      if (isOffline) {
        return buildOfflineSeasons(getDownloadedItems(), seriesId!);
      }

      if (!api || !user?.Id || !seriesId) return [];
      const response = await api.axiosInstance.get(
        `${api.basePath}/Shows/${seriesId}/Seasons`,
        {
          params: {
            userId: user?.Id,
            itemId: seriesId,
            Fields:
              "ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount",
          },
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
          // Leaving the show page before the list arrives cancels the request
          signal: context.signal,
        },
      );

      return response.data.Items;
    },
    staleTime: isOffline ? Infinity : Freshness.catalog,
    enabled:
      options.enabled !== false &&
      (isOffline || (!!api && !!user?.Id && !!seriesId)),
    ...(options.silent ? { notifyOnChangeProps: [] } : {}),
  });
}
