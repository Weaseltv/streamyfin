import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View, type ViewProps } from "react-native";
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
  pageSize?: number;
  onPressSeeAll?: () => void;
  enabled?: boolean;
  onLoaded?: () => void;
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
  pageSize = 10,
  onPressSeeAll,
  enabled = true,
  onLoaded,
  ...props
}) => {
  const effectivePageSize = Math.max(1, pageSize);
  const hasCalledOnLoaded = useRef(false);
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isSuccess,
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

  // Notify parent when data has loaded
  useEffect(() => {
    if (isSuccess && !hasCalledOnLoaded.current && onLoaded) {
      hasCalledOnLoaded.current = true;
      onLoaded();
    }
  }, [isSuccess, onLoaded]);

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
      deduped.push(item);
    }

    return deduped;
  }, [data]);

  const snapOffsets = useMemo(() => {
    const itemWidth = railCardWidth(orientation) + RAIL_GAP;
    return allItems.map((_, index) => index * itemWidth);
  }, [allItems, orientation]);

  if (hideIfEmpty === true && allItems.length === 0 && !isLoading) return null;
  if (disabled || !title) return null;

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;

    // Check if we're near the end of the scroll
    if (
      layoutMeasurement.width + contentOffset.x >=
      contentSize.width - paddingToBottom
    ) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
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
      {isLoading === false && allItems.length === 0 && (
        <View style={{ paddingHorizontal: Sizes.gutter }}>
          <Text variant='meta' muted>
            {t("home.no_items")}
          </Text>
        </View>
      )}
      {isLoading ? (
        <RailSkeleton orientation={orientation} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          snapToOffsets={snapOffsets}
          decelerationRate='fast'
        >
          <View
            style={{
              paddingHorizontal: Sizes.gutter,
              flexDirection: "row",
              gap: RAIL_GAP,
            }}
          >
            {allItems.map((item, index) => (
              <TouchableItemRouter
                item={item}
                key={`${item.Id}-${index}`}
                style={{ width: railCardWidth(orientation) }}
              >
                <ItemCard
                  item={item}
                  orientation={orientation}
                  useEpisodePoster={settings?.useEpisodeImagesForNextUp}
                  badge={badge}
                  badgeColor={badgeColor}
                />
                <ItemCardText item={item} />
              </TouchableItemRouter>
            ))}
            {/* Loading indicator for next page */}
            {isFetchingNextPage && (
              <View
                style={{
                  marginTop: orientation === "horizontal" ? 37 : 70,
                }}
              >
                <Loader />
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
