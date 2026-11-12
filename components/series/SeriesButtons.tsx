import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, View } from "react-native";
import { Chip } from "@/components/common/Chip";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useFavorite } from "@/hooks/useFavorite";
import { useMarkAsPlayed } from "@/hooks/useMarkAsPlayed";
import { usePlayTrailer } from "@/hooks/usePlayTrailer";
import { useShuffleQueue } from "@/hooks/useShuffleQueue";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { loadRandomItem } from "@/utils/randomItem";

/** The TV's buttons over artwork: white outline on a black backing. */
const BUTTON_STYLE = { backgroundColor: "rgba(0,0,0,0.8)" } as const;

/**
 * The series page's buttons, as on WeaselPlex TV (`SeriesDetails.kt`):
 * ADD TO WATCHLIST, PLAY TRAILER, MARK AS WATCHED (after a confirm), RANDOM
 * (opens a random episode) and SHUFFLE (plays up to 100 random episodes).
 */
export const SeriesButtons: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const router = useRouter();
  const { isFavorite, toggleFavorite } = useFavorite(item);
  const markAsPlayed = useMarkAsPlayed([item]);
  const trailer = usePlayTrailer(item);
  const { startShuffle } = useShuffleQueue();
  const [busy, setBusy] = useState<"random" | "shuffle" | null>(null);
  const played = item.UserData?.Played === true;
  const seriesId = item.Id;

  const markWatched = () =>
    Alert.alert(
      t(
        played
          ? "item_card.mark_series_unplayed"
          : "item_card.mark_series_played",
      ),
      undefined,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t(played ? "item_card.mark_unplayed" : "item_card.mark_played"),
          onPress: () => void markAsPlayed(!played),
        },
      ],
    );

  const openRandom = async () => {
    if (!api || !user?.Id || !seriesId || busy) return;
    setBusy("random");
    try {
      const episode = await loadRandomItem(api, {
        userId: user.Id,
        parentId: seriesId,
        recursive: true,
        includeItemTypes: ["Episode"],
      });
      if (episode) router.push(getItemNavigation(episode, "(home)") as any);
    } finally {
      setBusy(null);
    }
  };

  const shuffle = async () => {
    if (!api || !user?.Id || !seriesId || busy) return;
    setBusy("shuffle");
    try {
      const response = await getTvShowsApi(api).getEpisodes({
        seriesId,
        userId: user.Id,
        sortBy: "Random",
        limit: 100,
        fields: ["MediaSources"],
      });
      startShuffle(seriesId, response.data.Items ?? []);
    } finally {
      setBusy(null);
    }
  };

  const button = (
    key: string,
    label: string,
    onPress: () => void,
    disabled = false,
  ) => (
    <Chip
      key={key}
      label={label}
      tone='#FFFFFF'
      disabled={disabled}
      onPress={onPress}
      style={BUTTON_STYLE}
    />
  );

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        paddingHorizontal: Sizes.gutter,
        paddingTop: 12,
      }}
    >
      {button(
        "watchlist",
        t(
          isFavorite
            ? "item_card.remove_from_watchlist"
            : "item_card.add_to_watchlist",
        ),
        toggleFavorite,
      )}
      {button(
        "trailer",
        trailer.label,
        () => void trailer.play(),
        !trailer.available,
      )}
      {button(
        "played",
        t(played ? "item_card.mark_unplayed" : "item_card.mark_played"),
        markWatched,
      )}
      {button(
        "random",
        t("item_card.random"),
        () => void openRandom(),
        busy !== null,
      )}
      {button(
        "shuffle",
        t("item_card.shuffle"),
        () => void shuffle(),
        busy !== null,
      )}
    </View>
  );
};
