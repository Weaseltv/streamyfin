import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import {
  type UseQueryResult,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, View } from "react-native";
import { Button } from "@/components/Button";
import { LoadingLine } from "@/components/common/LoadingLine";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { ItemCardText } from "@/components/ItemCardText";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useManualRefresh } from "@/hooks/useManualRefresh";
import { useRefreshLibraryOnFocus } from "@/hooks/useRefreshLibraryOnFocus";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import {
  startupReadySessionAtom,
  startupSessionKey,
} from "@/utils/atoms/startupReady";
import { getKidHomeCollections } from "@/utils/jellyfin/kidContentGuard";
import { rowBadges } from "@/utils/streamingCollections";
import { HomeRowScrollView } from "./HomeRowScrollView";
import { ItemCard, RAIL_GAP, railCardWidth } from "./ItemCard";

const COLLECTION_DISCOVERY_MS = 3 * 60 * 1000;
const COLLECTION_PAGE_SIZE = 20;
const CONTINUE_LIMIT = 20;

type KidHomeRowState = {
  key: string;
  title: string;
  kicker?: string;
  orientation?: "horizontal" | "vertical";
  query: UseQueryResult<BaseItemDto[]>;
};

export function KidHome() {
  const api = useAtomValue(apiAtom);
  const userId = useAtomValue(userAtom)?.Id;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const setStartupReady = useSetAtom(startupReadySessionAtom);
  const scope = startupSessionKey(api?.basePath, userId);
  useSetPageAccent(NeonBoard.home);
  useRefreshLibraryOnFocus();

  const collections = useQuery({
    queryKey: ["kidHome", "collections", scope],
    enabled: !!scope,
    staleTime: COLLECTION_DISCOVERY_MS,
    refetchInterval: isFocused ? COLLECTION_DISCOVERY_MS : false,
    queryFn: async ({ signal }) => {
      if (!api || !userId) return [];
      const result = await getKidHomeCollections(api, userId, signal);
      return [
        ...new Map(
          result.flatMap(({ Id, Name }) =>
            Id ? [[Id, { id: Id, name: Name }] as const] : [],
          ),
        ).values(),
      ];
    },
  });

  const continueWatching = useQuery({
    queryKey: ["kidHome", "continue", scope],
    enabled: !!scope,
    queryFn: async ({ signal }) => {
      if (!api || !userId) return [];
      const [resume, nextUp] = await Promise.all([
        getItemsApi(api).getResumeItems(
          {
            userId,
            includeItemTypes: ["Movie", "Episode"],
            mediaTypes: ["Video"],
            limit: CONTINUE_LIMIT,
          },
          { signal },
        ),
        getTvShowsApi(api).getNextUp(
          {
            userId,
            enableResumable: false,
            limit: CONTINUE_LIMIT,
          },
          { signal },
        ),
      ]);
      const inProgress = resume.data.Items ?? [];
      const seriesInProgress = new Set(inProgress.map((item) => item.SeriesId));
      const items = [
        ...inProgress,
        ...(nextUp.data.Items ?? []).filter(
          (item) => !item.SeriesId || !seriesInProgress.has(item.SeriesId),
        ),
      ];
      const activity = (item: BaseItemDto) =>
        Date.parse(item.UserData?.LastPlayedDate || item.DateCreated || "") ||
        0;
      const unique = new Set<string>();
      return items
        .sort((a, b) => activity(b) - activity(a))
        .filter(({ Id }) => {
          if (!Id || unique.has(Id)) return false;
          unique.add(Id);
          return true;
        })
        .slice(0, CONTINUE_LIMIT);
    },
  });

  const watchAgain = useQuery({
    queryKey: ["kidHome", "watchAgain", scope],
    enabled: !!scope,
    queryFn: async ({ signal }) => {
      if (!api || !userId) return [];
      const { data } = await getItemsApi(api).getItems(
        {
          userId,
          includeItemTypes: ["Movie", "Series"],
          recursive: true,
          isPlayed: true,
          enableUserData: true,
          sortBy: ["DatePlayed"],
          sortOrder: ["Descending"],
          limit: 40,
          fields: ["RecursiveItemCount"],
        },
        { signal },
      );
      // Jellyfin also calls a series played when it has no visible episodes.
      return (data.Items ?? []).filter(
        (item) =>
          item.Type !== "Series" ||
          item.RecursiveItemCount == null ||
          (item.RecursiveItemCount > 0 && item.UserData?.Played === true),
      );
    },
  });

  const discovered = collections.data ?? [];
  const collectionRows = useQueries({
    queries: discovered.map((collection) => ({
      queryKey: ["kidHome", "collection", scope, collection.id],
      staleTime: COLLECTION_DISCOVERY_MS,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        if (!api || !userId) return [];
        const load = async (startIndex: number) =>
          (
            await getItemsApi(api).getItems(
              {
                userId,
                parentId: collection.id,
                startIndex,
                limit: COLLECTION_PAGE_SIZE,
              },
              { signal },
            )
          ).data.Items ?? [];
        const first = await load(0);
        // A full page can be filtered out even if the collection has more.
        return first.length ? first : load(COLLECTION_PAGE_SIZE);
      },
    })),
  });

  const { refreshing, onRefresh } = useManualRefresh(() =>
    queryClient.invalidateQueries({ queryKey: ["kidHome"] }),
  );

  useEffect(() => {
    if (!isFocused || !scope) return;
    const frame = requestAnimationFrame(() => setStartupReady(scope));
    return () => cancelAnimationFrame(frame);
  }, [isFocused, scope, setStartupReady]);

  const rows: KidHomeRowState[] = [
    {
      key: "continue",
      title: t("home.continue_watching"),
      kicker: t("home.kicker_next_up"),
      orientation: "horizontal",
      query: continueWatching,
    },
    {
      key: "watchAgain",
      title: t("home.kid_watch_again"),
      query: watchAgain,
    },
    ...discovered.map(({ id, name }, index) => ({
      key: id,
      title: name || t("home.kid_collection"),
      query: collectionRows[index],
    })),
  ];
  const queries = [...rows.map(({ query }) => query), collections];
  const loading = queries.some((query) => query.isLoading);
  const failed = queries.some((query) => query.isError);
  const hasItems = rows.some(({ query }) => !!query.data?.length);

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <LoadingLine active={loading} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 16, gap: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {rows.map(({ key, title, kicker, orientation = "vertical", query }) =>
          query.data?.length ? (
            <KidHomeRow
              key={key}
              rowKey={`${scope}:${key}`}
              title={title}
              kicker={kicker}
              orientation={orientation}
              items={query.data}
            />
          ) : null,
        )}
        {failed ? (
          <View style={{ paddingHorizontal: Sizes.gutter, gap: 8 }}>
            <Text variant='meta' muted>
              {t("home.section_failed")}
            </Text>
            <Button variant='border' loading={refreshing} onPress={onRefresh}>
              {t("home.retry")}
            </Button>
          </View>
        ) : (
          !loading &&
          !hasItems && (
            <Text variant='body' muted style={{ padding: Sizes.gutter }}>
              {t("home.kid_empty")}
            </Text>
          )
        )}
      </ScrollView>
    </View>
  );
}

function KidHomeRow({
  rowKey,
  title,
  kicker,
  orientation,
  items,
}: {
  rowKey: string;
  title: string;
  kicker?: string;
  orientation: "horizontal" | "vertical";
  items: BaseItemDto[];
}) {
  const badgeFor = rowBadges(items);
  const width = railCardWidth(orientation);
  return (
    <View>
      <SectionHeader title={title} kicker={kicker} count={items.length} />
      <HomeRowScrollView
        rowKey={rowKey}
        itemKeys={items.map((item) => item.Id ?? "")}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: RAIL_GAP,
          paddingHorizontal: Sizes.gutter,
        }}
      >
        {items.map((item) => (
          <TouchableItemRouter item={item} key={item.Id} style={{ width }}>
            <ItemCard
              item={item}
              orientation={orientation}
              badge={badgeFor(item)}
            />
            <ItemCardText item={item} />
          </TouchableItemRouter>
        ))}
      </HomeRowScrollView>
    </View>
  );
}
