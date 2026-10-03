import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom, useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { useDownload } from "@/providers/DownloadProvider";
import { useDismissedNextUp } from "@/utils/atoms/dismissedNextUp";

type Request = { item: BaseItemDto; isOffline: boolean };
const itemActionAtom = atom<Request | null>(null);
export const useRequestItemActions = () => useSetAtom(itemActionAtom);

export function ItemActionSheetHost() {
  const [request, setRequest] = useAtom(itemActionAtom);
  const close = useCallback(
    () => setRequest((current) => (current === request ? null : current)),
    [request, setRequest],
  );
  return request ? <ItemActionSheet request={request} close={close} /> : null;
}

function ItemActionSheet({
  request,
  close,
}: {
  request: Request;
  close: () => void;
}) {
  const { item, isOffline } = request;
  const { t } = useTranslation();
  const { showActionSheetWithOptions } = useActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item]);
  const { isFavorite, toggleFavorite } = useFavorite(item);
  const { deleteFile } = useDownload();
  const { dismiss: dismissSeriesFromNextUp } = useDismissedNextUp();
  const presented = useRef<Request | null>(null);
  const showActionSheet = useCallback(() => {
    if (
      !(
        item.Type === "Movie" ||
        item.Type === "Episode" ||
        item.Type === "Series"
      )
    )
      return;

    const actions: { label: string; onPress: () => void | Promise<void> }[] = [
      {
        label: t("common.mark_as_played"),
        onPress: () => markAsPlayedStatus(true),
      },
      {
        label: t("common.mark_as_not_played"),
        onPress: () => markAsPlayedStatus(false),
      },
      {
        label: isFavorite
          ? t("music.track_options.remove_from_favorites")
          : t("music.track_options.add_to_favorites"),
        onPress: toggleFavorite,
      },
    ];
    // Jellyfin's Next Up keeps offering a series' next unwatched episode for
    // as long as an earlier one is marked watched, and has no way to exclude
    // a series. "Mark as not played" on that episode cannot remove it — this
    // can. Lifted automatically when the user plays the series again.
    if (item.Type === "Episode" && item.SeriesId) {
      const seriesId = item.SeriesId;
      actions.push({
        label: t("common.remove_from_continue_and_next_up"),
        onPress: () => dismissSeriesFromNextUp(seriesId),
      });
    }
    let destructiveButtonIndex: number | undefined;
    if (isOffline && item.Id) {
      const itemId = item.Id;
      destructiveButtonIndex = actions.length;
      actions.push({
        label: t("home.downloads.delete_download"),
        onPress: () => deleteFile(itemId),
      });
    }
    const options = [...actions.map((a) => a.label), t("common.cancel")];
    const cancelButtonIndex = options.length - 1;

    showActionSheetWithOptions(
      { options, cancelButtonIndex, destructiveButtonIndex },
      async (selectedIndex) => {
        try {
          if (
            selectedIndex === undefined ||
            selectedIndex === cancelButtonIndex
          )
            return;
          await actions[selectedIndex]?.onPress();
        } finally {
          close();
        }
      },
    );
  }, [
    showActionSheetWithOptions,
    close,
    isFavorite,
    markAsPlayedStatus,
    toggleFavorite,
    isOffline,
    deleteFile,
    dismissSeriesFromNextUp,
    item.Id,
    item.Type,
    item.SeriesId,
    t,
  ]);

  useEffect(() => {
    if (presented.current === request) return;
    presented.current = request;
    showActionSheet();
  }, [request, showActionSheet]);
  return null;
}
