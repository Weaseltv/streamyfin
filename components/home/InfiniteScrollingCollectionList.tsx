import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList } from "@shopify/flash-list";
import {
  type QueryFunction,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { Button } from "@/components/Button";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { ItemCard, RAIL_GAP, railCardWidth } from "@/components/home/ItemCard";
import { RailSkeleton } from "@/components/home/RailSkeleton";
import { Loader } from "@/components/Loader";
import { Sizes } from "@/constants/neon";
import { useSettings } from "@/utils/atoms/settings";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  /** Rule colour: volt on Home; the type colour elsewhere. */
  accent?: string;
  /** Badge override for every card (the next-up rail). */
  badge?: string | null;
  badgeColor?: string;
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[], QueryKey, number>;
  hideIfEmpty?: boolean;
  /**
   * Drop items from the rendered rail without touching the query. Used by the
   * Continue & Next Up / Next Up rails to hide series the user dismissed —
   * filtering here rather than in queryFn keeps it instant (no refetch, no
   * skeleton) and leaves pagination, which keys off raw page length, alone.
   */
  excludeItem?: (item: BaseItemDto) => boolean;
  pageSize?: number;
  onPressSeeAll?: () => void;
  enabled?: boolean;
  /**
   * Fires once per mount when the query *settles* — success or error. Home's
   * priority gate consumes this, so a failed rail must still report in;
   * reporting only on success left every lower-priority section disabled
   * forever behind one broken endpoint.
   */
  onSettled?: () => void;
}

export const InfiniteScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  accent,
  badge,
  badgeColor,
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  excludeItem,
  pageSize = 10,
  onPressSeeAll,
  enabled = true,
  onSettled,
  ...props
}) => {
  const effectivePageSize = Math.max(1, pageSize);
  const hasCalledOnSettled = useRef(false);
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isSuccess,
    isError,
    isFetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKey,
    queryFn: ({ pageParam = 0, ...context }) =>
      queryFn({ ...context, queryKey, pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      // If the last page has fewer items than pageSize, we've reached the end
      if (lastPage.length < effectivePageSize) {
        return undefined;
      }
      // Otherwise, return the next start index based on how many items we already loaded.
      // This avoids overlaps if the server/page size differs from our configured page size.
      return allPages.reduce((acc, page) => acc + page.length, 0);
    },
    initialPageParam: 0,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    enabled,
  });

  // Notify the parent once this rail settles either way.
  useEffect(() => {
    if ((isSuccess || isError) && !hasCalledOnSettled.current && onSettled) {
      hasCalledOnSettled.current = true;
      onSettled();
    }
  }, [isSuccess, isError, onSettled]);

  const { t } = useTranslation();
  const { settings } = useSettings();

  // Flatten all pages into a single array (and de-dupe by Id to avoid UI duplicates)
  const allItems = useMemo(() => {
    const items = data?.pages.flat() ?? [];
    const seen = new Set<string>();
    const deduped: BaseItemDto[] = [];

    for (const item of items) {
      const id = item.Id;
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      if (excludeItem?.(item)) continue;
      deduped.push(item);
    }

    return deduped;
  }, [data, excludeItem]);

  const cardExtras = useMemo(
    () => ({
      useEpisodePoster: settings?.useEpisodeImagesForNextUp,
      badge,
      badgeColor,
      orientation,
    }),
    [settings?.useEpisodeImagesForNextUp, badge, badgeColor, orientation],
  );
  const renderRailItem = useCallback(
    ({ item }: { item: BaseItemDto }) => (
      <TouchableItemRouter
        item={item}
        style={{ width: railCardWidth(cardExtras.orientation) }}
      >
        <ItemCard
          item={item}
          orientation={cardExtras.orientation}
          useEpisodePoster={cardExtras.useEpisodePoster}
          badge={cardExtras.badge}
          badgeColor={cardExtras.badgeColor}
        />
        <ItemCardText item={item} />
      </TouchableItemRouter>
    ),
    [cardExtras],
  );

  const snapOffsets = useMemo(() => {
    const itemWidth = railCardWidth(orientation) + RAIL_GAP;
    return allItems.map((_, index) => index * itemWidth);
  }, [allItems, orientation]);

  // `isError` deliberately overrides hideIfEmpty: a rail that failed is not an
  // empty rail, and silently removing it is what made a partial outage look
  // like an empty Home screen.
  if (hideIfEmpty === true && allItems.length === 0 && !isLoading && !isError)
    return null;
  if (disabled || !title) return null;

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  };
  return (
    <View {...props}>
      <SectionHeader
        title={title}
        accent={accent}
        actionLabel={
          onPressSeeAll
            ? t("common.seeAll", { defaultValue: "See all" })
            : undefined
        }
        actionDisabled={isLoading}
        onPressAction={onPressSeeAll}
        count={isLoading || onPressSeeAll ? undefined : allItems.length}
      />
      {isError && allItems.length === 0 && (
        <View style={{ paddingHorizontal: Sizes.gutter, gap: 8 }}>
          <Text variant='meta' muted>
            {t("home.section_failed")}
          </Text>
          <Button
            accent={accent}
            variant='border'
            loading={isFetching}
            onPress={() => refetch()}
          >
            {t("home.retry")}
          </Button>
        </View>
      )}
      {isLoading === false && !isError && allItems.length === 0 && (
        <View style={{ paddingHorizontal: Sizes.gutter }}>
          <Text variant='meta' muted>
            {t("home.no_items")}
          </Text>
        </View>
      )}
      {isLoading ? (
        <RailSkeleton orientation={orientation} />
      ) : (
        // Virtualized: a plain horizontal ScrollView kept every card of every
        // loaded page mounted (with its image and subscriptions), so a rail
        // paged ten deep held ~100 live cards per rail across Home. FlashList
        // recycles cells and only mounts what is near the viewport.
        <FlashList
          horizontal
          data={allItems}
          keyExtractor={railKeyExtractor}
          renderItem={renderRailItem}
          extraData={cardExtras}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Sizes.gutter }}
          ItemSeparatorComponent={RailGap}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          snapToOffsets={snapOffsets}
          decelerationRate='fast'
          ListFooterComponent={
            isFetchingNextPage ? (
              <View
                style={{
                  marginLeft: RAIL_GAP,
                  marginTop: orientation === "horizontal" ? 37 : 70,
                }}
              >
                <Loader />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};

const railKeyExtractor = (item: BaseItemDto) => item.Id ?? "";
const RailGap = () => <View style={{ width: RAIL_GAP }} />;
