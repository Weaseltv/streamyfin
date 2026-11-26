import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { ItemImage } from "@/components/common/ItemImage";
import { NeonProgress } from "@/components/common/NeonProgress";
import { Text } from "@/components/common/Text";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { SimilarItems } from "@/components/SimilarItems";
import { NeonBoard, typeAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useFavorite } from "@/hooks/useFavorite";
import { useItemQuery } from "@/hooks/useItemQuery";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { startupSessionKey } from "@/utils/atoms/startupReady";
import { formatEpisodeNumber } from "@/utils/episodes";
import { kidResumeTicks } from "@/utils/kidTitlePlayback";
import { runtimeTicksToMinutes } from "@/utils/time";
import { seriesBackdropUrl, titleHeaderArt } from "@/utils/titlePageArtwork";
import { Image } from "../common/ServerImage";

export const KID_TITLE_FIELDS: ItemFields[] = ["Overview"];

/** Item metadata is scoped to the signed-in kid, even during cache hydration. */
export function useKidTitleQuery(itemId: string | undefined) {
  const api = useAtomValue(apiAtom);
  const userId = useAtomValue(userAtom)?.Id;
  const scope = startupSessionKey(api?.basePath, userId);
  return useItemQuery(
    scope ? itemId : undefined,
    false,
    KID_TITLE_FIELDS,
    undefined,
    {
      gcTime: 0,
      accountScope: scope,
    },
  );
}

export function KidTitleArtwork({ item }: { item: BaseItemDto }) {
  const api = useAtomValue(apiAtom);
  const seriesUrl =
    item.Type === "Series" ? seriesBackdropUrl(api, item) : null;
  const style = { width: "100%", height: "100%" } as const;
  return seriesUrl ? (
    <Image source={{ uri: seriesUrl }} style={style} />
  ) : (
    <ItemImage
      {...titleHeaderArt(item)}
      item={item}
      transition={0}
      style={style}
    />
  );
}

export function KidItemContent({ item }: { item: BaseItemDto }) {
  const accent = typeAccent(item);
  const series = useKidTitleQuery(
    item.Type === "Episode" && !item.OfficialRating?.trim()
      ? (item.SeriesId ?? undefined)
      : undefined,
  );
  useSetPageAccent(accent);
  return (
    <ParallaxScrollView
      headerHeight={230}
      overlap={40}
      headerImage={<KidTitleArtwork item={item} />}
    >
      <KidTitleHeading
        item={item}
        fallbackRating={series.data?.OfficialRating}
      />
      <KidTitleButtons
        item={item}
        playable={
          item.Type === "Movie" || item.Type === "Episode" ? item : undefined
        }
      />
      <KidTitleOverview text={item.Overview} />
      {item.Type === "Movie" && (
        <SimilarItems itemId={item.Id} accent={accent} hideIfEmpty />
      )}
    </ParallaxScrollView>
  );
}

export function KidTitleHeading({
  item,
  seasonCount,
  fallbackRating,
}: {
  item: BaseItemDto;
  seasonCount?: number;
  fallbackRating?: string | null;
}) {
  const { t } = useTranslation();
  const isEpisode = item.Type === "Episode";
  const episodeCode =
    isEpisode && item.ParentIndexNumber != null && item.IndexNumber != null
      ? formatEpisodeNumber(item, {
          includeSeason: true,
          seasonSeparator: " ",
          rangeSeparator: "–",
        })
      : null;
  const meta = [
    isEpisode ? episodeCode : item.ProductionYear,
    item.Type === "Series" && seasonCount
      ? t("item.seasons_count", { count: seasonCount })
      : (item.RunTimeTicks ?? 0) > 0
        ? runtimeTicksToMinutes(item.RunTimeTicks)
        : null,
    item.OfficialRating?.trim() || fallbackRating?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <View style={{ paddingHorizontal: Sizes.gutter, gap: 4 }}>
      <Text variant='heroTitle' numberOfLines={2}>
        {item.Name}
      </Text>
      {!!meta && (
        <Text variant='meta' muted>
          {meta}
        </Text>
      )}
    </View>
  );
}

export function KidTitleOverview({ text }: { text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <Text
      variant='body'
      numberOfLines={8}
      style={{
        paddingHorizontal: Sizes.gutter,
        paddingVertical: 14,
        lineHeight: 20,
      }}
    >
      {text}
    </Text>
  );
}

export function KidTitleButtons({
  item,
  playable,
  onShuffle,
  shuffleDisabled,
}: {
  item: BaseItemDto;
  playable?: BaseItemDto;
  onShuffle?: () => void;
  shuffleDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const playMedia = usePlayMedia();
  const { isFavorite, toggleFavorite } = useFavorite(item);
  const accent = typeAccent(item);
  const series = item.Type === "Series";
  const position = playable ? kidResumeTicks(playable) : 0;
  const runtime = playable?.RunTimeTicks ?? 0;
  const label =
    series &&
    playable?.ParentIndexNumber != null &&
    playable.IndexNumber != null
      ? t("item.kid_play_episode", {
          episode: formatEpisodeNumber(playable, {
            includeSeason: true,
            seasonSeparator: " · ",
            rangeSeparator: "–",
          }),
        })
      : t(!series && position > 0 ? "item.kid_keep_watching" : "item.play");
  const play = (playbackPositionTicks: number) => {
    if (!playable?.Id) return;
    void playMedia(
      { itemId: playable.Id, offline: false, playbackPositionTicks },
      { item: playable },
    );
  };
  return (
    <View style={{ paddingHorizontal: Sizes.gutter, marginTop: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
        {playable?.Id && (
          <Pressable
            accessibilityRole='button'
            onPress={() => play(position)}
            style={{
              flex: 1,
              minHeight: Sizes.button,
              borderRadius: 30,
              backgroundColor: accent,
              justifyContent: "center",
              alignItems: "center",
              flexDirection: "row",
              paddingHorizontal: 8,
              gap: 6,
            }}
          >
            <Feather name='play' size={18} color={NeonBoard.onAccent} />
            <Text
              variant='button'
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: NeonBoard.onAccent, flexShrink: 1 }}
            >
              {label}
            </Text>
          </Pressable>
        )}
        {!series && position > 0 && (
          <KidRoundAction
            icon='rotate-ccw'
            label={t("item.kid_start_over")}
            onPress={() => play(0)}
          />
        )}
        <KidRoundAction
          icon='heart'
          label={t(isFavorite ? "item.kid_on_watchlist" : "item.watchlist")}
          accessibilityLabel={t(
            isFavorite
              ? "item_card.remove_from_watchlist"
              : "item_card.add_to_watchlist",
          )}
          active={!!isFavorite}
          onPress={toggleFavorite}
        />
        {onShuffle && (
          <KidRoundAction
            icon='shuffle'
            label={t("item_card.shuffle")}
            onPress={onShuffle}
            disabled={shuffleDisabled}
          />
        )}
      </View>
      {series && !!playable?.Name && (
        <Text variant='meta' muted numberOfLines={1}>
          {t("item.kid_next_up", { name: playable.Name })}
        </Text>
      )}
      {!series && position > 0 && runtime > 0 && (
        <>
          <NeonProgress progress={position / runtime} color={accent} />
          <Text variant='meta' muted>
            {t("item.kid_time_left", {
              time: runtimeTicksToMinutes(runtime - position),
            })}
          </Text>
        </>
      )}
    </View>
  );
}

function KidRoundAction({
  icon,
  label,
  accessibilityLabel = label,
  active,
  disabled,
  onPress,
}: {
  icon: "rotate-ccw" | "heart" | "shuffle";
  label: string;
  accessibilityLabel?: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 66,
        alignItems: "center",
        gap: 4,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 24,
          backgroundColor: NeonBoard.card,
          borderColor: active ? NeonBoard.volt : NeonBoard.line2,
          borderWidth: 1,
        }}
      >
        <Feather
          name={icon}
          size={20}
          color={active ? NeonBoard.volt : NeonBoard.text}
        />
      </View>
      <Text variant='meta' numberOfLines={2} style={{ textAlign: "center" }}>
        {label}
      </Text>
    </Pressable>
  );
}
