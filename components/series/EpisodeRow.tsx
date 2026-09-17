import { Feather } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import type React from "react";
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
import { runtimeTicksToMinutes } from "@/utils/time";

interface Props {
  episode: BaseItemDto;
  /** The episode carries the yellow tally (the current or next-up one). */
  current?: boolean;
  /** Trailing element (the download button on the series page). */
  trailing?: React.ReactNode;
}

/**
 * A 64 episode row: Condensed 700 20 number in `low`, an 84×48 thumb with
 * the green played check or yellow progress, title 14/600, runtime ·
 * downloaded meta, and a yellow play glyph.
 */
export const EpisodeRow: React.FC<Props> = ({ episode, current, trailing }) => {
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const playMedia = usePlayMedia();
  const isOffline = useOfflineMode();
  const downloaded = useDownloadedItem(episode.Id);
  const played = episode.UserData?.Played === true;
  const pct = (episode.UserData?.PlayedPercentage ?? 0) / 100;
  const thumb = api
    ? `${api.basePath}/Items/${episode.Id}/Images/Primary?fillHeight=200&quality=80`
    : undefined;
  const meta = [
    episode.RunTimeTicks ? runtimeTicksToMinutes(episode.RunTimeTicks) : null,
    downloaded ? t("item.downloaded").toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <TouchableItemRouter
      item={episode}
      style={{
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingVertical: 8,
        gap: 12,
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
              backgroundColor: NeonBoard.yellow,
            },
            glowRule(NeonBoard.yellow),
          ]}
        />
      ) : null}
      <Text
        variant='numeral'
        allowFontScaling={false}
        style={{ width: 24, textAlign: "center" }}
      >
        {episode.IndexNumber ?? "–"}
      </Text>
      <View
        style={{
          width: Sizes.thumbEpisode.w,
          height: Sizes.thumbEpisode.h,
          borderWidth: 1,
          borderColor: NeonBoard.line,
          backgroundColor: NeonBoard.card2,
          overflow: "hidden",
        }}
      >
        {thumb ? (
          <Image
            id={episode.Id}
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
            <NeonProgress progress={pct} color={NeonBoard.yellow} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant='rowTitle' numberOfLines={1} style={{ fontSize: 14 }}>
          {episode.Name}
        </Text>
        {meta ? (
          <Text variant='meta' muted numberOfLines={1} style={{ marginTop: 2 }}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing}
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
        style={{ width: 28, alignItems: "flex-end" }}
      >
        <Feather name='play' size={18} color={NeonBoard.yellow} />
      </Pressable>
    </TouchableItemRouter>
  );
};
