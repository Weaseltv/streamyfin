import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
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

  const { data: similarItems, isLoading } = useQuery<BaseItemDto[]>({
    queryKey: ["similarItems", itemId, 25],
    queryFn: async () => {
      if (!api || !user?.Id || !itemId) return [];
      const response = await getLibraryApi(api).getSimilarItems({
        itemId,
        userId: user.Id,
        limit: 25,
      });

      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id,
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
    <View {...props}>
      <SectionHeader
        title={t("item_card.similar_items")}
        accent={accent}
        count={isLoading ? undefined : items.length}
      />
      <HorizontalScroll
        data={items}
        loading={isLoading}
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
    </View>
  );
};
