import { useActionSheet } from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeonBoard } from "@/constants/Colors";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

/** "Official Trailer" first and "Teaser" last, as on the TV (`TrailerService.kt`). */
const trailerRank = (name?: string | null) => {
  const value = (name ?? "").toLowerCase();
  if (value.includes("official trailer")) return 0;
  if (value.includes("teaser")) return 2;
  return 1;
};

const isYouTube = (url: string) => {
  try {
    const host = new URL(url).hostname;
    return host === "youtube.com" || host === "www.youtube.com";
  } catch {
    return false;
  }
};

/**
 * PLAY TRAILER, as on WeaselPlex TV: the item's local trailers first (played
 * in the app), then its remote trailers (opened in YouTube or the browser).
 * One trailer plays straight away; several open a chooser.
 */
export const usePlayTrailer = (item?: BaseItemDto | null) => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const playMedia = usePlayMedia();
  const insets = useSafeAreaInsets();
  const { showActionSheetWithOptions } = useActionSheet();

  const remote = useMemo(
    () =>
      (item?.RemoteTrailers ?? [])
        .filter((trailer) => !!trailer.Url)
        .sort((a, b) => trailerRank(a.Name) - trailerRank(b.Name)),
    [item?.RemoteTrailers],
  );
  const localCount = item?.LocalTrailerCount ?? 0;
  const count = localCount + remote.length;
  const label =
    count > 1
      ? t("item_card.trailers")
      : count === 1
        ? t("item_card.play_trailer")
        : t("item_card.no_trailers");

  const play = useCallback(async () => {
    if (!item?.Id) return;
    const locals =
      localCount > 0 && api && user?.Id
        ? (
            await getUserLibraryApi(api).getLocalTrailers({
              userId: user.Id,
              itemId: item.Id,
            })
          ).data
        : [];
    const options = [
      ...locals.map((trailer) => ({
        title: `${trailer.Name ?? t("item_card.play_trailer")} · ${t("item_card.local_trailer")}`,
        run: () => {
          if (trailer.Id)
            void playMedia(
              { itemId: trailer.Id, offline: false },
              { item: trailer },
            );
        },
      })),
      ...remote.map((trailer) => ({
        title: `${trailer.Name ?? t("item_card.play_trailer")} · ${t(
          isYouTube(trailer.Url!)
            ? "item_card.youtube"
            : "item_card.external_trailer",
        )}`,
        run: () => void Linking.openURL(trailer.Url!),
      })),
    ];
    if (options.length === 0) return;
    if (options.length === 1) {
      options[0].run();
      return;
    }
    showActionSheetWithOptions(
      {
        title: t("item_card.play_trailer"),
        options: [...options.map((option) => option.title), t("common.cancel")],
        cancelButtonIndex: options.length,
        ...(Platform.OS === "android"
          ? {
              tintColor: NeonBoard.text,
              titleTextStyle: { color: NeonBoard.text, fontWeight: "600" },
              containerStyle: {
                backgroundColor: NeonBoard.card,
                paddingBottom: insets.bottom,
              },
            }
          : {}),
      },
      (index) => {
        if (index !== undefined && index < options.length) options[index].run();
      },
    );
  }, [
    item?.Id,
    localCount,
    api,
    user?.Id,
    remote,
    playMedia,
    showActionSheetWithOptions,
    insets.bottom,
    t,
  ]);

  return { available: count > 0, label, play };
};
