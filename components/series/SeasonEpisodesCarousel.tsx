import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewStyle } from "react-native";
import { RAIL_GAP } from "@/components/home/ItemCard";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { Freshness } from "@/constants/queryFreshness";
import useRouter from "@/hooks/useAppRouter";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getDownloadedEpisodesBySeasonId } from "@/utils/downloads/offline-series";
import { countEpisodes } from "@/utils/episodes";
import {
  fetchSeasonEpisodes,
  seasonEpisodesQueryKey,
} from "@/utils/query/seasonEpisodes";
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

  // Online this is the show page's own list of the season, under the show
  // page's name for it. An episode opened from its show draws the strip from
  // what the show page already holds; opened from anywhere else, the request
  // it makes is the one the show page will reuse. The strip used to ask under
  // a name of its own, with five extra fields (descriptions among them) that
  // no card here draws.
  const { data: episodes, isPending } = useQuery<BaseItemDto[]>({
    queryKey: isOffline
      ? ["episodes", seasonId, isOffline]
      : seasonEpisodesQueryKey(item?.SeriesId, seasonId),
    queryFn: async (context) => {
      if (isOffline) {
        return getDownloadedEpisodesBySeasonId(getDownloadedItems(), seasonId!);
      }
      if (!api || !user?.Id || !item?.SeriesId || !seasonId) return [];
      return fetchSeasonEpisodes({
        api,
        userId: user.Id,
        seriesId: item.SeriesId,
        seasonId,
        signal: context.signal,
      });
    },
    enabled: !!seasonId && (isOffline || (!!api && !!user?.Id)),
    // A list the show page fetched a moment ago is not asked for again.
    // Progress changes do not wait for this: playback and mark-as-played
    // invalidate the list, which refetches it whatever its age.
    staleTime: isOffline ? undefined : Freshness.catalog,
  });

  const currentIndex = useMemo(() => {
    if (item?.Type !== "Episode" || !item.Id) return -1;
    return episodes?.findIndex((ep) => ep.Id === item.Id) ?? -1;
  }, [episodes, item?.Id, item?.Type]);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  // The strip moves to the current episode as soon as its cards are laid
  // out: the list reports that once, after its first cards are on screen.
  // It used to wait a fixed 400 ms after the episodes arrived.
  const laidOut = useRef(false);
  const onStripLaidOut = useCallback(() => {
    laidOut.current = true;
    if (currentIndexRef.current >= 0) scrollToIndex(currentIndexRef.current);
  }, []);
  // The current episode moved within a strip that is already laid out
  useEffect(() => {
    if (laidOut.current && currentIndex >= 0) scrollToIndex(currentIndex);
  }, [currentIndex]);

  const snapOffsets = useMemo(() => {
    const itemWidth = Sizes.thumb.w + RAIL_GAP;
    return episodes?.map((_, index) => index * itemWidth) || [];
  }, [episodes]);
  const { t } = useTranslation();

  return (
    <View>
      <SectionHeader
        title={item?.SeasonName ?? t("item_card.season")}
        accent={NeonBoard.show}
        count={episodes ? countEpisodes(episodes) : undefined}
      />
      <HorizontalScroll
        ref={scrollRef}
        data={episodes}
        extraData={item}
        loading={loading || isPending}
        onLoad={onStripLaidOut}
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
