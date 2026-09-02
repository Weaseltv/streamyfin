import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useDownload } from "@/providers/DownloadProvider";
import { useTwoWaySync } from "./useTwoWaySync";

/**
 * useRevalidatePlaybackProgressCache invalidates queries related to playback progress.
 */
export function useInvalidatePlaybackProgressCache() {
  const queryClient = useNetworkAwareQueryClient();
  const { getDownloadedItems } = useDownload();
  const { syncPlaybackState } = useTwoWaySync();

  /**
   * @param force when true, invalidate even if onlineManager reports offline.
   * Pass this for an explicit user-initiated refresh: pulling to refresh IS the
   * user asserting they want fresh data, and silently resolving because a
   * reachability heuristic says otherwise renders a spinner that changes
   * nothing and reports no error. The automatic callers leave it false so
   * genuinely offline sessions keep their cache.
   */
  const revalidate = async (force = false) => {
    // .bind is required: queryClient is a Proxy over a QueryClient that uses
    // private (#) fields, so an unbound reference throws on call.
    const invalidate = force
      ? queryClient.forceInvalidateQueries.bind(queryClient)
      : queryClient.invalidateQueries.bind(queryClient);

    // List of all the queries to invalidate
    const queriesToInvalidate = [
      ["item"],
      ["resumeItems"],
      ["continueWatching"],
      ["nextUp-all"],
      ["nextUp"],
      ["episodes"],
      ["seasons"],
      ["home"],
      ["downloadedItems"],
    ];

    // We Invalidate all the queries to the latest server versions
    await Promise.all(
      queriesToInvalidate.map((queryKey) =>
        invalidate({ queryKey }),
      ),
    );

    const downloadedFiles = getDownloadedItems();
    // Sync playback state for downloaded items
    if (downloadedFiles) {
      // We sync the playback state for the downloaded items. allSettled: one
      // item failing to sync must not reject the whole batch (the callers
      // fire-and-forget this promise).
      const syncResults = await Promise.allSettled(
        downloadedFiles.map((downloadedItem) =>
          syncPlaybackState(downloadedItem.item.Id!),
        ),
      );
      // syncPlaybackState handles its own errors and resolves to a boolean;
      // a rejection here is an unexpected bug worth surfacing.
      for (const result of syncResults) {
        if (result.status === "rejected") {
          console.error(
            "Unexpected syncPlaybackState rejection:",
            result.reason,
          );
        }
      }
      // We invalidate the queries again in case we have updated a server's playback progress.
      const shouldInvalidate = syncResults.some(
        (result) => result.status === "fulfilled" && result.value,
      );

      console.log("shouldInvalidate", shouldInvalidate);
      if (shouldInvalidate) {
        queriesToInvalidate.map((queryKey) =>
          invalidate({ queryKey }),
        );
      }
    }
  };

  return revalidate;
}
