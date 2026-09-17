import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { Image } from "@/components/common/ServerImage";
import { PosterFrame } from "@/components/posters/PosterFrame";
import { Sizes } from "@/constants/neon";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

type SeriesPosterProps = {
  item: BaseItemDto;
  showProgress?: boolean;
  size?: "normal" | "small";
  badge?: string | null;
};

/** 110×160 series poster in yellow: badge, unplayed count or played square. */
const SeriesPoster: React.FC<SeriesPosterProps> = ({
  item,
  showProgress = false,
  size = "normal",
  badge,
}) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(() => {
    if (item.Type === "Episode") {
      return `${api?.basePath}/Items/${item.SeriesId}/Images/Primary?fillHeight=389&quality=80&tag=${item.SeriesPrimaryImageTag}`;
    }
    return getPrimaryImageUrl({
      api,
      item,
      width: 300,
    });
  }, [item]);

  const blurhash = useMemo(() => {
    const key = item.ImageTags?.Primary as string;
    return item.ImageBlurHashes?.Primary?.[key];
  }, [item]);

  const box = size === "small" ? Sizes.posterSmall : Sizes.poster;

  return (
    <PosterFrame
      item={item}
      width={box.w}
      height={box.h}
      badge={badge}
      progress={showProgress}
    >
      <Image
        placeholder={{ blurhash }}
        key={item.Id}
        id={item.Id}
        source={url ? { uri: url } : null}
        cachePolicy={"memory-disk"}
        contentFit='cover'
        style={{ height: "100%", width: "100%" }}
      />
    </PosterFrame>
  );
};

export default SeriesPoster;
