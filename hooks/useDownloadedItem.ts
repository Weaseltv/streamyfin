import { useMemo } from "react";
import { useCompletedDownloads } from "@/providers/DownloadProvider";

/** True when the item is fully downloaded (reactive to the downloads list). */
export const useDownloadedItem = (id?: string | null): boolean => {
  const downloadedItems = useCompletedDownloads();
  return useMemo(
    () => !!id && downloadedItems.some((d) => d.item.Id === id),
    [downloadedItems, id],
  );
};
