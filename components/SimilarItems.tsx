import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import Animated from "react-native-reanimated";
import { useNearScreen } from "@/components/common/NearScreen";
import { ItemCard, railCardWidth } from "@/components/home/ItemCard";
import { POSTER_CAROUSEL_HEIGHT } from "@/constants/Values";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { rowBadges } from "@/utils/streamingCollections";
import { HorizontalScroll } from "./common/HorizontalScroll";
import { SectionHeader } from "./common/SectionHeader";
import { TouchableItemRouter } from "./common/TouchableItemRouter";
import { ItemCardText } from "./ItemCardText";

interface SimilarItemsProps extends ViewProps {
  itemId?: string | null;
  accent?: string;
}

const CARD_WIDTH = railCardWidth("vertical");

/**
 * MORE LIKE THIS, as on WeaselPlex TV: the server's similar titles (movies
 * and shows), 25 of them, with MOVIE / SHOW badges when they're mixed.
 */
export const SimilarItems: React.FC<SimilarItemsProps> = ({
  itemId,
  accent,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  // The row sits at the bottom of the page. Its request waits until the
  // viewer has scrolled near it (or the page is short enough that it already
  // is), instead of taking a connection as the page opens. A row already in
  // the cache is drawn at once either way.
  const { ref, onLayout, near } = useNearScreen();

  // Pending, not loading: a held request has nothing to show yet either
  const { data: similarItems, isPending } = useQuery<BaseItemDto[]>({
    queryKey: ["similarItems", itemId, 25],
    queryFn: async ({ signal }) => {
      if (!api || !user?.Id || !itemId) return [];
      const response = await getLibraryApi(api).getSimilarItems(
        {
          itemId,
          userId: user.Id,
          limit: 25,
        },
        // Leaving the page before the row arrives cancels the request
        { signal },
      );

      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && near,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const items = useMemo(
    () =>
      similarItems?.filter((i) => i.Type === "Movie" || i.Type === "Series") ||
      [],
    [similarItems],
  );
  const badgeFor = useMemo(() => rowBadges(items), [items]);

  return (
    <Animated.View {...props} ref={ref} onLayout={onLayout} collapsable={false}>
      <SectionHeader
        title={t("item_card.similar_items")}
        accent={accent}
        count={isPending ? undefined : items.length}
      />
      <HorizontalScroll
        data={items}
        loading={isPending}
        height={POSTER_CAROUSEL_HEIGHT}
        noItemsText={t("item_card.no_similar_items_found")}
        renderItem={(item: BaseItemDto, idx: number) => (
          <TouchableItemRouter
            key={idx}
            item={item}
            style={{ width: CARD_WIDTH }}
          >
            <View>
              <ItemCard
                item={item}
                orientation='vertical'
                badge={badgeFor(item)}
              />
              <ItemCardText item={item} />
            </View>
          </TouchableItemRouter>
        )}
      />
    </Animated.View>
  );
};
