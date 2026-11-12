import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, type ViewProps } from "react-native";
import { PosterFrame } from "@/components/posters/PosterFrame";
import { Sizes } from "@/constants/neon";
import { ImageWidths } from "@/utils/imageSizes";
import { ItemImage } from "../common/ItemImage";

interface Props extends ViewProps {
  item: BaseItemDto;
  showProgress?: boolean;
  /** Card width; posters keep 10:15 and other items stay square. */
  width?: number;
  /** Badge override; grids inside a typed library pass `null`. */
  badge?: string | null;
}

/**
 * Grid card: a 10:15 poster (or a square tile) in the shared PosterFrame.
 * Seasons use their own poster and episodes their series' poster, as on the
 * TV, so they line up with the movies and shows around them.
 */
export const ItemPoster: React.FC<Props> = ({
  item,
  showProgress = true,
  width = Sizes.poster.w,
  badge,
  ...props
}) => {
  const isPoster =
    item.Type === "Movie" ||
    item.Type === "Series" ||
    item.Type === "BoxSet" ||
    item.Type === "Season" ||
    item.Type === "Episode";
  const height = isPoster ? Math.round((width * 15) / 10) : width;
  const imageItem: BaseItemDto =
    item.Type === "Episode" && item.SeriesId && item.SeriesPrimaryImageTag
      ? {
          Id: item.SeriesId,
          Type: "Series",
          ImageTags: { Primary: item.SeriesPrimaryImageTag },
        }
      : item;

  return (
    <View {...props}>
      <PosterFrame
        item={item}
        width={width}
        height={height}
        badge={badge}
        progress={showProgress}
        watched={isPoster}
      >
        <ItemImage
          style={{ width: "100%", height: "100%" }}
          item={imageItem}
          width={ImageWidths.poster}
        />
      </PosterFrame>
    </View>
  );
};
