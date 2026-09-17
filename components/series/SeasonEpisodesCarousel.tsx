import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewStyle } from "react-native";
import { RAIL_GAP } from "@/components/home/ItemCard";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getDownloadedEpisodesBySeasonId } from "@/utils/downloads/offline-series";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import {
  HorizontalScroll,
  type HorizontalScrollRef,
} from "../common/HorizontalScroll";
import { SectionHeader } from "../common/SectionHeader";
import { ItemCardText } from "../ItemCardText";

interface Props {
  item?: BaseItemDto | null;
  loading?: boolean;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
}

export const SeasonEpisodesCarousel: React.FC<Props> = ({
  item,
  loading,
  style,
  containerStyle,
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const router = useRouter();
  const isOffline = useOfflineMode();
  // Read the live (cached) downloads DB inside the query rather than the
  // provider's downloadedItems snapshot, so refetches after
  // updateDownloadedItem() reflect the latest state instead of a stale
  // refreshKey-gated snapshot. getAllDownloadedItems() is cached, so this stays cheap.
  const { getDownloadedItems } = useDownload();

  const scrollRef = useRef<HorizontalScrollRef>(null);

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollToIndex(index, -16);
  };

  const seasonId = useMemo(() => {
    return item?.SeasonId;
  }, [item]);

  const { data: episodes, isPending } = useQuery({
    queryKey: ["episodes", seasonId, isOffline],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesBySeasonId(getDownloadedItems(), seasonId!);
      }
      if (!api || !user?.Id || !item?.SeriesId) return [];
      const response = await getTvShowsApi(api).getEpisodes({
        userId: user.Id,
        seasonId: seasonId || undefined,
        seriesId: item.SeriesId,
        enableUserData: true,
        fields: [
          "ItemCounts",
          "PrimaryImageAspectRatio",
          "CanDelete",
          "MediaSourceCount",
          "Overview",
        ],
      });
      return response.data.Items as BaseItemDto[];
    },
    enabled: !!seasonId && (isOffline || (!!api && !!user?.Id)),
  });

  useEffect(() => {
    if (item?.Type === "Episode" && item.Id) {
      const index = episodes?.findIndex((ep) => ep.Id === item.Id);
      if (index !== undefined && index !== -1) {
        setTimeout(() => {
          scrollToIndex(index);
        }, 400);
      }
    }
  }, [episodes, item]);

  const snapOffsets = useMemo(() => {
    const itemWidth = Sizes.thumb.w + RAIL_GAP;
    return episodes?.map((_, index) => index * itemWidth) || [];
  }, [episodes]);
  const { t } = useTranslation();

  return (
    <View>
      <SectionHeader
        title={item?.SeasonName ?? t("item_card.season")}
        accent={NeonBoard.yellow}
        count={episodes?.length}
      />
      <HorizontalScroll
        ref={scrollRef}
        data={episodes}
        extraData={item}
        loading={loading || isPending}
        style={style}
        containerStyle={containerStyle}
        renderItem={(_item, _idx) => (
          <TouchableOpacity
            key={_item.Id}
            onPress={() => {
              router.setParams({ id: _item.Id });
            }}
            style={{
              width: Sizes.thumb.w,
              opacity: item?.Id === _item.Id ? 1 : 0.5,
            }}
          >
            <ContinueWatchingPoster
              item={_item}
              useEpisodePoster
              badge={null}
            />
            <ItemCardText item={_item} />
          </TouchableOpacity>
        )}
        snapToOffsets={snapOffsets}
        decelerationRate='fast'
      />
    </View>
  );
};
