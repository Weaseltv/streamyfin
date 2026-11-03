import { Feather } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { NeonProgress } from "@/components/common/NeonProgress";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { NeonBoard } from "@/constants/Colors";
import { glowChip, glowRule, Sizes } from "@/constants/neon";
import { useDownloadedItem } from "@/hooks/useDownloadedItem";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { formatEpisodeNumber } from "@/utils/episodes";
import { formatAirDate, runtimeTicksToMinutes } from "@/utils/time";

interface Props {
  episode: BaseItemDto;
  /** The episode carries the yellow tally (the current or next-up one). */
  current?: boolean;
}

const EPISODE_NUMBER_COLUMN_WIDTH = 52;

/**
 * A quiet episode pill in a fixed leading column keeps every thumbnail aligned.
 * Titles and metadata can wrap; the pill stays on one line even for long ranges.
 */
export const EpisodeRow = memo(function EpisodeRow({
  episode,
  current,
}: Props) {
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const playMedia = usePlayMedia();
  const isOffline = useOfflineMode();
  const downloaded = useDownloadedItem(episode.Id);
  const episodeNumber = formatEpisodeNumber(episode, {
    fallback: "–",
    rangeSeparator: "–",
  });
  const played = episode.UserData?.Played === true;
  const pct = (episode.UserData?.PlayedPercentage ?? 0) / 100;
  const thumb = api
    ? `${api.basePath}/Items/${episode.Id}/Images/Primary?fillHeight=200&quality=80`
    : undefined;
  const meta = [
    formatAirDate(episode.PremiereDate),
    episode.RunTimeTicks ? runtimeTicksToMinutes(episode.RunTimeTicks) : null,
    downloaded ? t("item.downloaded").toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableItemRouter
      item={episode}
      style={{
        minHeight: 76,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: Sizes.gutter,
        paddingRight: Sizes.gutter,
        paddingVertical: 8,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      {current ? (
        <View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: Sizes.tally,
              backgroundColor: NeonBoard.show,
            },
            glowRule(NeonBoard.show),
          ]}
        />
      ) : null}
      <View
        style={{
          width: EPISODE_NUMBER_COLUMN_WIDTH,
          flexShrink: 0,
          alignItems: "center",
        }}
      >
        <View
          style={{
            minWidth: 34,
            maxWidth: EPISODE_NUMBER_COLUMN_WIDTH,
            minHeight: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 4,
            paddingVertical: 2,
            borderWidth: 1,
            borderColor: NeonBoard.line2,
            borderRadius: 4,
            backgroundColor: NeonBoard.inset,
          }}
        >
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            style={{
              flexShrink: 1,
              fontSize: 10,
              lineHeight: 13,
              fontWeight: "500",
              textAlign: "center",
            }}
          >
            {t("item.episode_number_short", { number: episodeNumber })}
          </Text>
        </View>
      </View>
      <View
        style={{
          width: Sizes.thumbEpisode.w,
          height: Sizes.thumbEpisode.h,
          flexShrink: 0,
          borderWidth: 1,
          borderColor: NeonBoard.line,
          backgroundColor: NeonBoard.card2,
          overflow: "hidden",
        }}
      >
        {thumb ? (
          <Image
            id={episode.Id}
            recyclingKey={episode.Id}
            source={{ uri: thumb }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
            cachePolicy='memory-disk'
          />
        ) : null}
        {played ? (
          <View
            style={[
              {
                position: "absolute",
                top: 3,
                right: 3,
                width: 16,
                height: 16,
                backgroundColor: NeonBoard.green,
                alignItems: "center",
                justifyContent: "center",
              },
              glowChip(NeonBoard.green),
            ]}
          >
            <Feather name='check' size={11} color={NeonBoard.onAccent} />
          </View>
        ) : pct > 0 ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
            <NeonProgress progress={pct} color={NeonBoard.show} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant='rowTitle' numberOfLines={2} style={{ fontSize: 14 }}>
          {episode.Name}
        </Text>
        {meta ? (
          <Text
            variant='meta'
            muted
            numberOfLines={2}
            style={{ marginTop: 4, fontSize: 11, lineHeight: 15 }}
          >
            {meta}
          </Text>
        ) : null}
      </View>
      <Pressable
        hitSlop={8}
        accessibilityLabel={t("item.play")}
        onPress={() =>
          void playMedia(
            {
              itemId: episode.Id!,
              offline: isOffline,
              playbackPositionTicks:
                episode.UserData?.PlaybackPositionTicks ?? 0,
            },
            { item: episode },
          )
        }
        style={{ width: 28, flexShrink: 0, alignItems: "flex-end" }}
      >
        <Feather name='play' size={18} color={NeonBoard.show} />
      </Pressable>
    </TouchableItemRouter>
  );
});
