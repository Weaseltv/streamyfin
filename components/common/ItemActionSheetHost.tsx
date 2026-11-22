import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { useMenuActionSheet } from "@/components/common/ActionSheetCard";
import useRouter from "@/hooks/useAppRouter";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { useShuffleQueue } from "@/hooks/useShuffleQueue";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useDismissedNextUp } from "@/utils/atoms/dismissedNextUp";
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
/** How long the menu waits for the server's Watchlist state before opening. */
const FRESH_STATE_TIMEOUT_MS = 1200;
const hasItemActions = (item: BaseItemDto) =>
  item.Type === "Movie" ||
  item.Type === "Episode" ||
  item.Type === "Series" ||
  item.Type === "Season";
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
  // iOS: the system action sheet. Android phone: the same card drawn in
  // React Native (no title, Cancel last), replacing the bottom sheet.
  const { showActionSheetWithOptions, actionSheet } = useMenuActionSheet();
  const markAsPlayedStatus = useMarkAsPlayed([item], true);
  const { isFavorite, favoriteMutation, syncIsFavorite } = useFavorite(
    item,
    true,
  );
  // The server's Watchlist state, read when the menu opens (see below).
  const serverIsFavorite = useRef<boolean | undefined>(undefined);
  const { deleteFile } = useDownload();
  const { dismiss: dismissSeriesFromNextUp } = useDismissedNextUp();
  const router = useRouter();
  const playMedia = usePlayMedia();
  const { startShuffle } = useShuffleQueue();
  const presented = useRef<Request | null>(null);
  const executed = useRef<Request | null>(null);
  const showActionSheet = useCallback(() => {
    if (!hasItemActions(item)) {
      close();
      return;
    }
    const favorite = serverIsFavorite.current ?? isFavorite;

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
        label: favorite
          ? t("common.remove_from_favorites")
          : t("common.add_to_favorites"),
        onPress: async () => {
          await favoriteMutation.mutateAsync(!favorite);
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
    request,
    isOffline,
    deleteFile,
    dismissSeriesFromNextUp,
    item,
    playMedia,
    startShuffle,
    router,
    t,
  ]);

  // The Watchlist entry reads the server when the menu opens (owner, round 2
  // parity review, F4: "Read the current Watchlist state when the menu
  // opens"). The card's copy, or a stale copy on another card, could be older
  // than a change made since, so the menu offered "Add to watchlist" for a
  // film already on it. Offline, or when the server is slow, it opens with
  // what the app knows.
  const readIsFavorite = useCallback(async () => {
    const api = atomStore.get(apiAtom);
    const user = atomStore.get(userAtom);
    if (isOffline || !item.Id || !api || !user?.Id || !hasItemActions(item))
      return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FRESH_STATE_TIMEOUT_MS);
    try {
      const response = await getItemsApi(api).getItems(
        { ids: [item.Id], userId: user.Id, enableImages: false },
        { signal: controller.signal },
      );
      return response.data.Items?.[0]?.UserData?.IsFavorite ?? undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }, [atomStore, isOffline, item]);

  const showLatest = useRef(showActionSheet);
  showLatest.current = showActionSheet;
  useEffect(() => {
    if (presented.current === request) return;
    presented.current = request;
    void readIsFavorite().then((current) => {
      // Closed, or replaced by another long press, while the server answered.
      if (atomStore.get(itemActionAtom) !== request) return;
      serverIsFavorite.current = current;
      if (current !== undefined) syncIsFavorite(current);
      showLatest.current();
    });
  }, [request, atomStore, readIsFavorite, syncIsFavorite]);
  return actionSheet;
}
