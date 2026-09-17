import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { SectionHeader } from "@/components/common/SectionHeader";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Sizes } from "@/constants/neon";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToMinutes } from "@/utils/time";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

/**
 * The series page's next-up row: a 70 row with a yellow tally, 96×54 thumb
 * with progress, "S2:E4 · The Desk", runtime · time left, compact RESUME.
 */
export const NextUp: React.FC<{ seriesId: string }> = ({ seriesId }) => {
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const playMedia = usePlayMedia();

  const { data: items } = useQuery({
    queryKey: ["nextUp", seriesId],
    queryFn: async () => {
      if (!api) return null;
      return (
        await getTvShowsApi(api).getNextUp({
          userId: user?.Id,
          seriesId,
          fields: ["MediaSourceCount"],
          limit: 1,
        })
      ).data.Items;
    },
    enabled: !!api && !!seriesId && !!user?.Id,
    staleTime: 0,
  });

  const item = items?.[0];
  if (!item) return null;

  const position = item.UserData?.PlaybackPositionTicks ?? 0;
  const runtime = item.RunTimeTicks ?? 0;
  const meta = [
    runtime ? runtimeTicksToMinutes(runtime) : null,
    position > 0 && runtime
      ? `${runtimeTicksToMinutes(runtime - position)} left`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View>
      <SectionHeader title={t("item_card.next_up")} accent={NeonBoard.yellow} />
      <TouchableItemRouter
        item={item}
        style={{
          minHeight: 70,
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
        <ContinueWatchingPoster item={item} useEpisodePoster size='tiny' />
        <View style={{ flex: 1 }}>
          <Text variant='rowTitle' numberOfLines={1} style={{ fontSize: 14 }}>
            {`S${item.ParentIndexNumber}:E${item.IndexNumber} · ${item.Name}`}
          </Text>
          <Text variant='meta' muted numberOfLines={1} style={{ marginTop: 2 }}>
            {meta}
          </Text>
        </View>
        <Button
          compact
          accent={NeonBoard.yellow}
          onPress={() =>
            void playMedia(
              {
                itemId: item.Id!,
                offline: false,
                playbackPositionTicks: position,
              },
              { item },
            )
          }
          iconLeft={
            <Text variant='button' style={{ color: NeonBoard.onAccent }}>
              ▶
            </Text>
          }
        >
          {position > 0 ? t("item.resume") : t("item.play")}
        </Button>
      </TouchableItemRouter>
    </View>
  );
};
