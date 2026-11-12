import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { PixelRatio } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { PosterFrame } from "@/components/posters/PosterFrame";
import { Sizes } from "@/constants/neon";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

type MoviePosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
  /** `small` is the 96×140 poster used by search and the watchlist. */
  size?: "normal" | "small";
  /** Hide the type badge (grids inside a typed library do not repeat it). */
  badge?: string | null;
  dimensions?: { w: number; h: number };
};

/** 110×160 poster with a 1pt border, the type badge, played square and progress. */
const MoviePoster: React.FC<MoviePosterProps> = ({
  item,
  showProgress = true,
  size = "normal",
  badge,
  dimensions,
}) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(() => {
    return getPrimaryImageUrl({
      api,
      item,
      width: dimensions
        ? Math.max(300, Math.ceil(dimensions.w * PixelRatio.get()))
        : 300,
    });
  }, [api, item, dimensions?.w]);

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  const box = size === "small" ? Sizes.posterSmall : Sizes.poster;

  return (
    <PosterFrame
      item={item}
      width={dimensions?.w ?? box.w}
      height={dimensions?.h ?? box.h}
      indicatorScale={dimensions ? dimensions.w / box.w : 1}
      badge={badge}
      progress={showProgress}
    >
      <Image
        placeholder={{ blurhash }}
        recyclingKey={item.Id}
        id={item.Id}
        source={url ? { uri: url } : null}
        cachePolicy={"memory-disk"}
        contentFit='cover'
        style={{ width: "100%", height: "100%" }}
      />
    </PosterFrame>
  );
};

export default MoviePoster;
