import { useMemo } from "react";
import { useDownload } from "@/providers/DownloadProvider";

/** True when the item is fully downloaded (reactive to the downloads list). */
export const useDownloadedItem = (id?: string | null): boolean => {
  const { downloadedItems } = useDownload();
  return useMemo(
    () => !!id && downloadedItems.some((d) => d.item.Id === id),
    [downloadedItems, id],
  );
};
