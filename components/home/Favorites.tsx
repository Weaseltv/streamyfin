import type { Api } from "@jellyfin/sdk";
import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi, getPersonsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { Text } from "@/components/common/Text";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import {
  FavoriteRequestQueue,
  favoriteCountChanged,
  favoriteRailNeedsRefresh,
  favoriteRailVisible,
  favoriteScope,
  favoriteTotals,
} from "@/utils/query/favorites";
import { InfiniteScrollingCollectionList } from "./InfiniteScrollingCollectionList";

const ITEM_TYPES: BaseItemKind[] = [
  "Series",
  "Movie",
  "Episode",
  "Video",
  "BoxSet",
  "Playlist",
];
const ACCENT = sectionAccent("watchlist");
const RAILS = [
  { type: "Series", label: "favorites.series", accent: NeonBoard.show },
  { type: "Movie", label: "favorites.movies", accent: NeonBoard.movie },
  { type: "Episode", label: "favorites.episodes", accent: NeonBoard.show },
  { type: "Person", label: "favorites.people", accent: ACCENT },
  { type: "Video", label: "favorites.videos", accent: ACCENT },
  { type: "BoxSet", label: "favorites.boxsets", accent: ACCENT },
  { type: "Playlist", label: "favorites.playlists", accent: ACCENT },
] as const;

export function Favorites() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const server = user?.ServerId || api?.basePath;
  // A new identity owns a new request queue and cannot render the previous rails.
  return (
    <FavoritesBody
      key={`${server}:${user?.Id}`}
      api={api}
      server={server}
      userId={user?.Id}
    />
  );
}

function FavoritesBody({
  api,
  server,
  userId,
}: {
  api: Api | null;
  server: string | undefined;
  userId: string | undefined;
}) {
  useSetPageAccent(ACCENT);
  const router = useRouter();
  const client = useQueryClient();
  const scope = useMemo(() => favoriteScope(server, userId), [server, userId]);
  const queue = useMemo(() => new FavoriteRequestQueue(), []);
  const ready = !!api && !!server && !!userId;
  const itemCount = useQuery({
    queryKey: [...scope, "count", "items"],
    queryFn: async ({ signal }) => {
      const response = await getItemsApi(api!).getItems(
        {
          userId,
          filters: ["IsFavorite"],
          recursive: true,
          collapseBoxSetItems: false,
          excludeLocationTypes: ["Virtual"],
          enableTotalRecordCount: true,
          includeItemTypes: ITEM_TYPES,
          limit: 0,
        },
        { signal },
      );
      if (response.data.TotalRecordCount == null)
        throw new Error("Favourite count unavailable");
      return response.data.TotalRecordCount;
    },
    enabled: ready,
    staleTime: 60_000,
    retry: 1,
  });
  const peopleCount = useQuery({
    queryKey: [...scope, "count", "people"],
    queryFn: async ({ signal }) => {
      // Persons limit=0 can mean unlimited. Request one slim record plus the
      // endpoint's total, never the entire favourite-person catalogue.
      const response = await getPersonsApi(api!).getPersons(
        {
          userId,
          isFavorite: true,
          limit: 1,
          enableImages: false,
          enableUserData: false,
        },
        { signal },
      );
      if (response.data.TotalRecordCount == null)
        throw new Error("Favourite people count unavailable");
      return response.data.TotalRecordCount;
    },
    enabled: ready,
    staleTime: 60_000,
    retry: 1,
  });
  const totals = favoriteTotals(itemCount, peopleCount);
  const previousCounts = useRef<{ items?: number; people?: number } | null>(
    null,
  );
  useEffect(() => {
    const previous = previousCounts.current;
    const itemsChanged = favoriteCountChanged(previous?.items, itemCount);
    const peopleChanged = favoriteCountChanged(previous?.people, peopleCount);
    if (itemsChanged || peopleChanged) {
      // Refresh stale cached rails after changes elsewhere, while leaving this
      // refresh/mutation's in-flight and already-current requests alone.
      void client.invalidateQueries(
        {
          queryKey: scope,
          predicate: (query) => {
            const group = query.queryKey[scope.length];
            const type = query.queryKey[scope.length + 1];
            const changed = type === "Person" ? peopleChanged : itemsChanged;
            const updatedAt =
              type === "Person"
                ? peopleCount.dataUpdatedAt
                : itemCount.dataUpdatedAt;
            return (
              (group === "rail" || group === "see-all") &&
              changed &&
              favoriteRailNeedsRefresh(query.state, updatedAt)
            );
          },
        },
        { cancelRefetch: false },
      );
    }
    previousCounts.current = {
      items: itemCount.isSuccess ? itemCount.data : previous?.items,
      people: peopleCount.isSuccess ? peopleCount.data : previous?.people,
    };
  }, [
    client,
    scope,
    itemCount.data,
    itemCount.isSuccess,
    itemCount.dataUpdatedAt,
    peopleCount.data,
    peopleCount.isSuccess,
    peopleCount.dataUpdatedAt,
  ]);

  return (
    <View style={{ backgroundColor: NeonBoard.stage }}>
      <LoadingLine
        accent={ACCENT}
        active={ready && (itemCount.isLoading || peopleCount.isLoading)}
      />
      {((itemCount.isPending && itemCount.fetchStatus === "paused") ||
        (peopleCount.isPending && peopleCount.fetchStatus === "paused")) && (
        <View style={{ paddingHorizontal: Sizes.gutter }}>
          <Text variant='meta' muted>
            {t("home.server_unreachable_message")}
          </Text>
        </View>
      )}
      <PageHead
        eyebrow={t("favorites.eyebrow")}
        title={t("tabs.favorites")}
        accent={ACCENT}
        trailing={
          totals.total
            ? t("favorites.saved_count", { count: totals.total })
            : null
        }
      />
      {(itemCount.isError || peopleCount.isError) && (
        <View style={{ paddingHorizontal: Sizes.gutter, gap: 8 }}>
          <Text variant='meta' muted>
            {t("home.section_failed")}
          </Text>
          <Button
            accent={ACCENT}
            variant='border'
            loading={itemCount.isFetching || peopleCount.isFetching}
            onPress={() => {
              void itemCount.refetch();
              void peopleCount.refetch();
            }}
          >
            {t("home.retry")}
          </Button>
        </View>
      )}
      {totals.empty && (
        <EmptyState
          icon='heart'
          accent={ACCENT}
          title={t("favorites.noDataTitle")}
          detail={t("favorites.noData")}
        />
      )}
      <View style={{ gap: 4, paddingBottom: 8 }}>
        {RAILS.map(({ type, label, accent }) => {
          const count = type === "Person" ? peopleCount : itemCount;
          // Remove zero-count rails instead of disabling them with stale cards.
          if (!ready || !favoriteRailVisible(count)) return null;
          return (
            <InfiniteScrollingCollectionList
              key={type}
              title={t(label)}
              accent={accent}
              hideIfEmpty
              pageSize={20}
              retry={1}
              orientation={type === "Episode" ? "horizontal" : "vertical"}
              queryKey={[...scope, "rail", type]}
              queryFn={({ pageParam, signal }) =>
                queue.run(signal, async () => {
                  if (type === "Person") {
                    if (pageParam > 0) return [];
                    return (
                      (
                        await getPersonsApi(api!).getPersons(
                          {
                            userId,
                            isFavorite: true,
                            limit: 20,
                            fields: ["PrimaryImageAspectRatio"],
                          },
                          { signal },
                        )
                      ).data.Items ?? []
                    );
                  }
                  return (
                    (
                      await getItemsApi(api!).getItems(
                        {
                          userId,
                          sortBy: ["SeriesSortName", "SortName"],
                          sortOrder: ["Ascending"],
                          filters: ["IsFavorite"],
                          recursive: true,
                          fields: ["PrimaryImageAspectRatio"],
                          collapseBoxSetItems: false,
                          excludeLocationTypes: ["Virtual"],
                          enableTotalRecordCount: false,
                          startIndex: pageParam,
                          limit: 20,
                          includeItemTypes: [type],
                        },
                        { signal },
                      )
                    ).data.Items ?? []
                  );
                })
              }
              onPressSeeAll={
                type === "Person"
                  ? undefined
                  : () =>
                      router.push({
                        pathname: "/(auth)/(tabs)/(favorites)/see-all",
                        params: { type, title: t(label) },
                      })
              }
            />
          );
        })}
      </View>
    </View>
  );
}
