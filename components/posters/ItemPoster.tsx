import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, type ViewProps } from "react-native";
import { PosterFrame } from "@/components/posters/PosterFrame";
import { Sizes } from "@/constants/neon";
import { ImageWidths } from "@/utils/imageSizes";
import { ItemImage } from "../common/ItemImage";

interface Props extends ViewProps {
  item: BaseItemDto;
  showProgress?: boolean;
  /** Card width; the poster keeps 10:15 and other items stay square. */
  width?: number;
  /** Badge override; grids inside a typed library pass `null`. */
  badge?: string | null;
}

/** Grid card: a 10:15 poster (or a square tile) in the shared PosterFrame. */
export const ItemPoster: React.FC<Props> = ({
  item,
  showProgress = true,
  width = Sizes.poster.w,
  badge,
  ...props
}) => {
  const isPoster =
    item.Type === "Movie" || item.Type === "Series" || item.Type === "BoxSet";
  const height = isPoster ? Math.round((width * 15) / 10) : width;

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
          item={item}
          width={ImageWidths.poster}
        />
      </PosterFrame>
    </View>
  );
};
