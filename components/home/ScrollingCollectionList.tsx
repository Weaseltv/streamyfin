import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useQuery,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, View, type ViewProps } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { ItemCard, RAIL_GAP, railCardWidth } from "@/components/home/ItemCard";
import { RailSkeleton } from "@/components/home/RailSkeleton";
import { Sizes } from "@/constants/neon";
import { useInView } from "@/hooks/useInView";
import { useSettings } from "@/utils/atoms/settings";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  /** Rule colour: volt on Home; the type colour on item, search and watchlist pages. */
  accent?: string;
  /** Badge override for every card (the next-up rail). */
  badge?: string | null;
  badgeColor?: string;
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[]>;
  hideIfEmpty?: boolean;
  scrollY?: number; // For lazy loading
  enableLazyLoading?: boolean; // Enable/disable lazy loading
}

export const ScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  accent,
  badge,
  badgeColor,
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  scrollY = 0,
  enableLazyLoading = false,
  ...props
}) => {
  const { ref, isInView, onLayout } = useInView(scrollY, {
    enabled: enableLazyLoading,
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKey,
    queryFn,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    enabled: enableLazyLoading ? isInView : true,
  });

  const { t } = useTranslation();
  const { settings } = useSettings();

  // Show skeleton if loading OR if lazy loading is enabled and not in view yet
  const shouldShowSkeleton = isLoading || (enableLazyLoading && !isInView);

  if (hideIfEmpty === true && data?.length === 0 && !shouldShowSkeleton)
    return null;
  if (disabled || !title) return null;

  return (
    <View ref={ref} onLayout={onLayout} {...props}>
      <SectionHeader
        title={title}
        accent={accent}
        count={shouldShowSkeleton ? undefined : data?.length}
      />
      {!shouldShowSkeleton && data?.length === 0 && (
        <View style={{ paddingHorizontal: Sizes.gutter }}>
          <Text variant='meta' muted>
            {t("home.no_items")}
          </Text>
        </View>
      )}
      {shouldShowSkeleton ? (
        <RailSkeleton orientation={orientation} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View
            style={{
              paddingHorizontal: Sizes.gutter,
              flexDirection: "row",
              gap: RAIL_GAP,
            }}
          >
            {data?.map((item) => (
              <TouchableItemRouter
                item={item}
                key={item.Id}
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
          </View>
        </ScrollView>
      )}
    </View>
  );
};
