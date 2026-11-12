import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import MoviePoster from "@/components/posters/MoviePoster";
import SeriesPoster from "@/components/posters/SeriesPoster";
import { Sizes } from "@/constants/neon";

interface Props {
  item: BaseItemDto;
  /** `horizontal` rails use 16:9 thumbs; `vertical` rails use posters. */
  orientation: "horizontal" | "vertical";
  useEpisodePoster?: boolean;
  /** Badge override for every card on the rail (the next-up rail). */
  badge?: string | null;
  badgeColor?: string;
  size?: "normal" | "small";
  /** Custom collection posters retain their artwork's 2:3 ratio. */
  posterDimensions?: { w: number; h: number };
}

/** Picks the poster or thumb for an item by type and rail orientation. */
export const ItemCard: React.FC<Props> = ({
  item,
  orientation,
  useEpisodePoster,
  badge,
  badgeColor,
  size = "normal",
  posterDimensions,
}) => {
  if (orientation === "horizontal") {
    return (
      <ContinueWatchingPoster
        item={item}
        useEpisodePoster={item.Type === "Episode" ? useEpisodePoster : false}
        badge={badge}
        badgeColor={badgeColor}
        size={size}
      />
    );
  }
  if (
    item.Type === "Series" ||
    item.Type === "Episode" ||
    item.Type === "Season"
  ) {
    return <SeriesPoster item={item} size={size} badge={badge} />;
  }
  return (
    <MoviePoster
      item={item}
      size={size}
      badge={badge}
      dimensions={posterDimensions}
    />
  );
};

/** Card width for a rail, so snap offsets and skeletons agree with the cards. */
export const railCardWidth = (
  orientation: "horizontal" | "vertical",
  size: "normal" | "small" = "normal",
) =>
  orientation === "horizontal"
    ? size === "small"
      ? Sizes.thumbSmall.w
      : Sizes.thumb.w
    : size === "small"
      ? Sizes.posterSmall.w
      : Sizes.poster.w;

export const RAIL_GAP = 10;
