import type {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  RefreshControl,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import {
  type BrowseType,
  TypeButtonRow,
} from "@/components/common/BrowseButtonRows";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import { FilterButton } from "@/components/filters/FilterButton";
import { ItemCardText } from "@/components/ItemCardText";
import { ItemPoster } from "@/components/posters/ItemPoster";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useManualRefresh } from "@/hooks/useManualRefresh";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  SortByOption,
  SortOrderOption,
  sortOptions,
  sortOrderOptions,
} from "@/utils/atoms/filters";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { favoriteScope } from "@/utils/query/favorites";
import { loadRandomItem } from "@/utils/randomItem";

const ACCENT = sectionAccent("watchlist");
const PAGE_SIZE = 48;
const GRID_GAP = 10;

/** ALL / MOVIES / SHOWS as the TV's Watchlist reads them (SHOWS covers seasons and episodes). */
const TYPES: Record<BrowseType, BaseItemKind[]> = {
  All: [
    "Movie",
    "Series",
    "Season",
    "Episode",
    "Video",
    "BoxSet",
    "MusicVideo",
  ],
  Movie: ["Movie"],
  Series: ["Series", "Season", "Episode"],
};

/**
 * The Watchlist tab as one grid, as on WeaselPlex TV (owner decision 4):
 * ALL / MOVIES / SHOWS and RANDOM, sort by name by default, everything the
 * member added to their Watchlist (Jellyfin favourites).
 */
export function WatchlistGrid() {
  useSetPageAccent(ACCENT);
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [type, setType] = useState<BrowseType>("All");
  const [sortBy, setSortBy] = useState<SortByOption[]>([SortByOption.SortName]);
  const [sortOrder, setSortOrder] = useState<SortOrderOption[]>([
    SortOrderOption.Ascending,
  ]);
  const [randomBusy, setRandomBusy] = useState(false);

  const columns = Math.max(
    2,
    Math.floor((screenWidth - Sizes.gutter * 2 + GRID_GAP) / (100 + GRID_GAP)),
  );
  const cardWidth = Math.floor(
    (screenWidth -
      insets.left -
      insets.right -
      Sizes.gutter * 2 -
      GRID_GAP * (columns - 1)) /
      columns,
  );

  const scope = favoriteScope(user?.ServerId || api?.basePath, user?.Id);
  const {
    data,
    isLoading,
    isFetching,
    isError,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: [...scope, "grid", type, sortBy[0], sortOrder[0]],
    queryFn: async ({ pageParam, signal }) => {
      if (!api || !user?.Id) return { items: [] as BaseItemDto[], total: 0 };
      const response = await getItemsApi(api).getItems(
        {
          userId: user.Id,
          recursive: true,
          isFavorite: true,
          includeItemTypes: TYPES[type],
          sortBy: [sortBy[0], "SortName"],
          sortOrder: [sortOrder[0]],
          fields: ["PrimaryImageAspectRatio", "ChildCount"],
          startIndex: pageParam,
          limit: PAGE_SIZE,
        },
        { signal },
      );
      return {
        items: response.data.Items ?? [],
        total: response.data.TotalRecordCount ?? 0,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return lastPage.items.length === PAGE_SIZE && loaded < lastPage.total
        ? loaded
        : undefined;
    },
    enabled: !!api && !!user?.Id,
  });
  const items = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total;
  const { refreshing, onRefresh } = useManualRefresh(() =>
    refetch({ throwOnError: true }),
  );

  // RANDOM: one random title from the Watchlist, opened (never played), as on the TV
  const openRandom = useCallback(async () => {
    if (!api || !user?.Id || randomBusy) return;
    setRandomBusy(true);
    try {
      const item = await loadRandomItem(api, {
        userId: user.Id,
        recursive: true,
        isFavorite: true,
        includeItemTypes: TYPES[type],
      });
      if (item) router.push(getItemNavigation(item, "(favorites)") as any);
    } finally {
      setRandomBusy(false);
    }
  }, [api, user?.Id, randomBusy, type, router]);

  // Cancels the list's gutter so the head rule runs edge to edge
  const header = (
    <View
      style={{
        marginLeft: -(insets.left + Sizes.gutter),
        marginRight: -(insets.right + Sizes.gutter),
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <LoadingLine accent={ACCENT} active={isLoading} />
      <PageHead
        eyebrow={t("favorites.eyebrow")}
        title={t("tabs.favorites")}
        accent={ACCENT}
        trailing={total ? t("favorites.saved_count", { count: total }) : null}
        bleedRule
      />
      <TypeButtonRow
        value={type}
        onChange={setType}
        onRandom={openRandom}
        randomBusy={randomBusy}
      />
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: Sizes.gutter,
          paddingVertical: 12,
          gap: 8,
        }}
        data={["sortBy", "sortOrder"]}
        keyExtractor={(key) => key}
        renderItem={({ item: key }) =>
          key === "sortBy" ? (
            <FilterButton
              accent={ACCENT}
              showValue
              id='watchlist'
              queryKey='sortBy'
              queryFn={async () => sortOptions.map((s) => s.key)}
              set={setSortBy}
              values={sortBy}
              title={t("library.filters.sort_by")}
              renderItemLabel={(item) =>
                sortOptions.find((i) => i.key === item)?.value || ""
              }
            />
          ) : (
            <FilterButton
              accent={ACCENT}
              showValue
              id='watchlist'
              queryKey='sortOrder'
              queryFn={async () => sortOrderOptions.map((s) => s.key)}
              set={setSortOrder}
              values={sortOrder}
              title={t("library.filters.sort_order")}
              renderItemLabel={(item) =>
                sortOrderOptions.find((i) => i.key === item)?.value || ""
              }
            />
          )
        }
      />
      {isError && items.length === 0 ? (
        <View style={{ paddingHorizontal: Sizes.gutter, gap: 8 }}>
          <Text variant='meta' muted>
            {t("home.section_failed")}
          </Text>
          <Button
            accent={ACCENT}
            variant='border'
            loading={isFetching}
            onPress={() => refetch()}
          >
            {t("home.retry")}
          </Button>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <FlashList
        data={items}
        numColumns={columns}
        keyExtractor={(item) => item.Id ?? ""}
        contentInsetAdjustmentBehavior='automatic'
        ListHeaderComponent={header}
        ListEmptyComponent={
          isLoading || isError ? null : (
            <EmptyState
              icon='heart'
              accent={ACCENT}
              title={t("favorites.noDataTitle")}
              detail={t("favorites.noData")}
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ACCENT}
            colors={[ACCENT]}
            progressBackgroundColor={NeonBoard.card}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetching) void fetchNextPage();
        }}
        onEndReachedThreshold={1}
        contentContainerStyle={{
          paddingLeft: insets.left + Sizes.gutter,
          paddingRight: insets.right + Sizes.gutter,
          paddingBottom: 24,
        }}
        renderItem={({ item, index }) => (
          <TouchableItemRouter
            item={item}
            style={{
              width: "100%",
              marginBottom: 6,
              alignItems:
                index % columns === 0
                  ? "flex-start"
                  : (index + 1) % columns === 0
                    ? "flex-end"
                    : "center",
            }}
          >
            <View style={{ width: cardWidth }}>
              <ItemPoster item={item} width={cardWidth} />
              <ItemCardText item={item} />
            </View>
          </TouchableItemRouter>
        )}
      />
    </View>
  );
}
