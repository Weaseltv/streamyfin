import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { useDownload } from "@/providers/DownloadProvider";
import { userAtom } from "@/providers/JellyfinProvider";
import { useDismissedNextUp } from "@/utils/atoms/dismissedNextUp";

type Request = {
  item: BaseItemDto;
  isOffline: boolean;
  ownerKey: string | null;
};
const ownerKeyFor = (
  user: { Id?: string | null; ServerId?: string | null } | null,
) => (user?.Id ? `${user.ServerId ?? ""}:${user.Id}` : null);
const itemActionAtom = atom<Request | null>(null);
// Read account identity at the long press without adding a user subscription
// to every card. Never reopen a previous account's pending sheet after logout.
const requestItemActionsAtom = atom(
  null,
  (get, set, request: Omit<Request, "ownerKey">) => {
    set(itemActionAtom, { ...request, ownerKey: ownerKeyFor(get(userAtom)) });
  },
);
export const useRequestItemActions = () => useSetAtom(requestItemActionsAtom);

export function ItemActionSheetHost() {
  const [request, setRequest] = useAtom(itemActionAtom);
  const user = useAtomValue(userAtom);
  const ownerKey = ownerKeyFor(user);
  useEffect(() => {
    setRequest((current) => (current?.ownerKey === ownerKey ? current : null));
  }, [ownerKey, setRequest]);
  const close = useCallback(
    () => setRequest((current) => (current === request ? null : current)),
    [request, setRequest],
  );
  return request && request.ownerKey === ownerKey ? (
    <ItemActionSheet request={request} close={close} />
  ) : null;
}

function ItemActionSheet({
  request,
  close,
}: {
  request: Request;
  close: () => void;
}) {
  const { item, isOffline } = request;
  const atomStore = useStore();
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
          // A global action-sheet overlay can outlive this component on
          // logout/account switch. Never invoke its old account's mutation.
          if (ownerKeyFor(atomStore.get(userAtom)) !== request.ownerKey) return;
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
    atomStore,
    request.ownerKey,
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
