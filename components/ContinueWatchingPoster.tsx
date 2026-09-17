import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { PosterFrame } from "@/components/posters/PosterFrame";
import { NeonBoard, typeLabel } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { apiAtom } from "@/providers/JellyfinProvider";

type ContinueWatchingPosterProps = {
  item: BaseItemDto;
  useEpisodePoster?: boolean;
  /** `normal` 176×99 rails; `small` 150×84 search / watchlist; `tiny` 96×54 next-up. */
  size?: "small" | "normal" | "tiny";
  showPlayButton?: boolean;
  /** Override the badge ("NEXT UP" on the next-up rail). */
  badge?: string | null;
  badgeColor?: string;
};

/** 16:9 thumb with a 1pt border, type badge top-left, progress at the bottom. */
const ContinueWatchingPoster: React.FC<ContinueWatchingPosterProps> = ({
  item,
  useEpisodePoster = false,
  size = "normal",
  showPlayButton = false,
  badge,
  badgeColor,
}) => {
  const api = useAtomValue(apiAtom);

  /**
   * Get horizontal poster for movie and episode, with failover to primary.
   */
  const url = useMemo(() => {
    if (!api) {
      return;
    }
    if (item.Type === "Episode" && useEpisodePoster) {
      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
    }
    if (item.Type === "Episode") {
      // Matched pair: the parent that owns the Thumb (ParentThumbItemId), not the
      // backdrop owner — otherwise the Thumb tag is requested on the wrong item → black.
      if (item.ParentThumbItemId && item.ParentThumbImageTag) {
        return `${api?.basePath}/Items/${item.ParentThumbItemId}/Images/Thumb?fillHeight=389&quality=80&tag=${item.ParentThumbImageTag}`;
      }

      return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
    }
    if (item.ImageTags?.Thumb) {
      return `${api?.basePath}/Items/${item.Id}/Images/Thumb?fillHeight=389&quality=80&tag=${item.ImageTags?.Thumb}`;
    }

    return `${api?.basePath}/Items/${item.Id}/Images/Primary?fillHeight=389&quality=80`;
    // useEpisodePoster in deps so flipping the prop re-computes the URL live.
  }, [api, item, useEpisodePoster]);

  const box =
    size === "small"
      ? Sizes.thumbSmall
      : size === "tiny"
        ? Sizes.thumbNextUp
        : Sizes.thumb;

  // An episode on a rail reads as its show.
  const label =
    badge !== undefined
      ? badge
      : item.Type === "Episode"
        ? "SHOW"
        : typeLabel(item);

  return (
    <PosterFrame
      item={item}
      width={box.w}
      height={box.h}
      badge={size === "tiny" ? null : label}
      badgeColor={badgeColor}
      watched={size !== "tiny"}
    >
      {url ? (
        <Image
          key={item.Id}
          id={item.Id}
          source={{ uri: url }}
          cachePolicy={"memory-disk"}
          contentFit='cover'
          style={{ width: "100%", height: "100%" }}
        />
      ) : null}
      {showPlayButton && (
        <View className='absolute inset-0 flex items-center justify-center'>
          <Ionicons name='play' size={28} color={NeonBoard.text} />
        </View>
      )}
    </PosterFrame>
  );
};

export default ContinueWatchingPoster;
