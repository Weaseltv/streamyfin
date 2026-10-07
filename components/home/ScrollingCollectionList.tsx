import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useQuery,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View, type ViewProps } from "react-native";
import { Button } from "@/components/Button";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { ItemCard, RAIL_GAP, railCardWidth } from "@/components/home/ItemCard";
import { RailSkeleton } from "@/components/home/RailSkeleton";
import { Sizes } from "@/constants/neon";
import { useInView } from "@/hooks/useInView";
import { useSettings } from "@/utils/atoms/settings";
import { collectionCardPresentation } from "@/utils/streamingCollections";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";

interface Props extends ViewProps {
  title?: string | null;
  /** Query tag for matching loading placeholders; real cards use their own Tags. */
  collectionTag?: string;
  orientation?: "horizontal" | "vertical";
  /** Rule colour: volt on Home; the type colour on item, search and watchlist pages. */
  accent?: string;
  /** Badge override for every card (the next-up rail). */
  badge?: string | null;
  badgeColor?: string;
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[]>;
  refetchInterval?: number | false;
  /** Live curated rows must not retain or persist yesterday's collections. */
  cache?: boolean;
  hideIfEmpty?: boolean;
  scrollY?: number; // For lazy loading
  enableLazyLoading?: boolean; // Enable/disable lazy loading
}

export const ScrollingCollectionList: React.FC<Props> = ({
  title,
  collectionTag,
  orientation = "vertical",
  accent,
  badge,
  badgeColor,
  disabled = false,
  queryFn,
  queryKey,
  refetchInterval,
  cache = true,
  hideIfEmpty = false,
  scrollY = 0,
  enableLazyLoading = false,
  ...props
}) => {
  const layout = {
    width: railCardWidth(orientation),
  };
  const presentation = (item: Pick<BaseItemDto, "Type" | "Tags">) =>
    collectionCardPresentation(
      Platform.isTV || orientation !== "vertical" ? {} : item,
      layout,
    );
  const placeholder = presentation(
    collectionTag ? { Type: "BoxSet", Tags: [collectionTag] } : {},
  );
  const { ref, isInView, onLayout } = useInView(scrollY, {
    enabled: enableLazyLoading,
  });

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: queryKey,
    queryFn,
    staleTime: cache ? 60 * 1000 : 0,
    ...(cache ? {} : { gcTime: 0 }),
    refetchOnWindowFocus: !cache,
    refetchOnReconnect: true,
    refetchInterval,
    enabled: enableLazyLoading ? isInView : true,
  });

  const { t } = useTranslation();
  const { settings } = useSettings();

  // Show skeleton if loading OR if lazy loading is enabled and not in view yet
  const shouldShowSkeleton = isLoading || (enableLazyLoading && !isInView);
  const hasArtworkCards = data?.some((item) => presentation(item).imageOnly);

  if (
    hideIfEmpty === true &&
    data?.length === 0 &&
    !shouldShowSkeleton &&
    !isError
  )
    return null;
  if (disabled || !title) return null;

  return (
    <View ref={ref} onLayout={onLayout} {...props}>
      <SectionHeader
        title={title}
        accent={accent}
        count={shouldShowSkeleton ? undefined : data?.length}
      />
      {isError && !data?.length && (
        <View style={{ paddingHorizontal: Sizes.gutter, gap: 8 }}>
          <Text variant='meta' muted>
            {t("home.section_failed")}
          </Text>
          <Button
            variant='border'
            loading={isFetching}
            onPress={() => void refetch()}
          >
            {t("home.retry")}
          </Button>
        </View>
      )}
      {!shouldShowSkeleton && !isError && data?.length === 0 && (
        <View style={{ paddingHorizontal: Sizes.gutter }}>
          <Text variant='meta' muted>
            {t("home.no_items")}
          </Text>
        </View>
      )}
      {shouldShowSkeleton ? (
        <RailSkeleton
          orientation={orientation}
          width={placeholder.width}
          imageOnly={placeholder.imageOnly}
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          {...(hasArtworkCards ? { removeClippedSubviews: false } : {})}
        >
          <View
            style={{
              paddingHorizontal: Sizes.gutter,
              flexDirection: "row",
              gap: RAIL_GAP,
              ...(hasArtworkCards ? { paddingVertical: 8 } : {}),
            }}
          >
            {data?.map((item) => {
              const card = presentation(item);
              return (
                <TouchableItemRouter
                  item={item}
                  key={item.Id}
                  style={{ width: card.width }}
                  {...(card.imageOnly
                    ? {
                        accessible: true,
                        accessibilityRole: "button" as const,
                        accessibilityLabel: item.Name ?? undefined,
                      }
                    : {})}
                >
                  <ItemCard
                    item={item}
                    orientation={orientation}
                    useEpisodePoster={settings?.useEpisodeImagesForNextUp}
                    badge={badge}
                    badgeColor={badgeColor}
                  />
                  {!card.imageOnly && <ItemCardText item={item} />}
                </TouchableItemRouter>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
