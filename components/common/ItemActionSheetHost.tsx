import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { useShuffleQueue } from "@/hooks/useShuffleQueue";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useDismissedNextUp } from "@/utils/atoms/dismissedNextUp";
import { usePageAccent } from "@/utils/atoms/pageAccent";
import {
  admitItemAction,
  canExecuteItemAction,
  clearItemAction,
} from "@/utils/itemActionOwnership";

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
    const current = get(itemActionAtom);
    const ownerKey = ownerKeyFor(get(userAtom));
    set(
      itemActionAtom,
      admitItemAction(current, { ...request, ownerKey }, ownerKey),
    );
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
    () =>
      setRequest((current) =>
        request ? clearItemAction(current, request) : current,
      ),
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
  const insets = useSafeAreaInsets();
  const accent = usePageAccent();
  const { showActionSheetWithOptions } = useActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item], true);
  const { isFavorite, favoriteMutation } = useFavorite(item, true);
  const { deleteFile } = useDownload();
  const { dismiss: dismissSeriesFromNextUp } = useDismissedNextUp();
  const router = useRouter();
  const playMedia = usePlayMedia();
  const { startShuffle } = useShuffleQueue();
  const presented = useRef<Request | null>(null);
  const executed = useRef<Request | null>(null);
  const showActionSheet = useCallback(() => {
    if (
      !(
        item.Type === "Movie" ||
        item.Type === "Episode" ||
        item.Type === "Series" ||
        item.Type === "Season"
      )
    ) {
      close();
      return;
    }

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
        onPress: async () => {
          await favoriteMutation.mutateAsync(!isFavorite);
        },
      },
    ];
    // A season, as on the TV: Play (from its first episode on), Shuffle (its
    // episodes in random order), the usual marks, and Go to series
    if (item.Type === "Season" && item.SeriesId && item.Id) {
      const seriesId = item.SeriesId;
      const seasonId = item.Id;
      const loadEpisodes = async () => {
        const api = atomStore.get(apiAtom);
        const user = atomStore.get(userAtom);
        if (!api || !user?.Id) return [];
        const response = await getTvShowsApi(api).getEpisodes({
          seriesId,
          seasonId,
          userId: user.Id,
          fields: ["MediaSources"],
        });
        return (response.data.Items ?? []).filter(
          (episode) => episode.LocationType !== "Virtual",
        );
      };
      actions.unshift(
        {
          label: t("common.play"),
          onPress: async () => {
            const first = (await loadEpisodes())[0];
            if (first?.Id)
              await playMedia(
                { itemId: first.Id, offline: isOffline },
                { item: first },
              );
          },
        },
        {
          label: t("player.shuffle"),
          onPress: async () =>
            startShuffle(seriesId, (await loadEpisodes()).slice(0, 100), {
              isOffline,
            }),
        },
      );
      actions.push({
        label: t("item_card.go_to_series"),
        onPress: () =>
          router.push({ pathname: "/series/[id]", params: { id: seriesId } }),
      });
    }
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
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
        ...(Platform.OS === "android" && !Platform.isTV
          ? {
              title: item.Name ?? undefined,
              tintColor: NeonBoard.text,
              cancelButtonTintColor: accent,
              destructiveColor: NeonBoard.red,
              titleTextStyle: { color: accent, fontWeight: "600" as const },
              containerStyle: {
                backgroundColor: NeonBoard.card,
                paddingBottom: insets.bottom,
                borderTopWidth: 2,
                borderTopColor: accent,
              },
              showSeparators: true,
              separatorStyle: { backgroundColor: NeonBoard.line },
            }
          : {}),
      },
      async (selectedIndex) => {
        if (
          !canExecuteItemAction(
            request,
            atomStore.get(itemActionAtom),
            ownerKeyFor(atomStore.get(userAtom)),
            executed.current,
          )
        )
          return;
        executed.current = request;
        let progressToast: string | number | undefined;
        try {
          // A global action-sheet overlay can outlive this component on
          // logout/account switch. Never invoke its old account's mutation.
          if (
            selectedIndex === undefined ||
            selectedIndex === cancelButtonIndex
          )
            return;
          const action = actions[selectedIndex];
          if (!action) return;
          progressToast = toast.loading(action.label);
          await action.onPress();
        } catch {
          toast.error(t("login.an_unexpected_error_occurred"));
        } finally {
          if (progressToast !== undefined) toast.dismiss(progressToast);
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
    favoriteMutation,
    accent,
    insets.bottom,
    request,
    item.Name,
    isOffline,
    deleteFile,
    dismissSeriesFromNextUp,
    item.Id,
    item.Type,
    item.SeriesId,
    playMedia,
    startShuffle,
    router,
    t,
  ]);

  useEffect(() => {
    if (presented.current === request) return;
    presented.current = request;
    showActionSheet();
  }, [request, showActionSheet]);
  return null;
}
