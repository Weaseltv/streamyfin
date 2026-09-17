import type { Api } from "@jellyfin/sdk";
import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi, getPersonsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { InfiniteScrollingCollectionList } from "./InfiniteScrollingCollectionList";

type FavoriteTypes =
  | "Series"
  | "Movie"
  | "Episode"
  | "Video"
  | "BoxSet"
  | "Playlist"
  | "Person";
type EmptyByType = Record<FavoriteTypes, boolean>;

const FAVORITE_ITEM_TYPES: BaseItemKind[] = [
  "Series",
  "Movie",
  "Episode",
  "Video",
  "BoxSet",
  "Playlist",
];

const initialEmptyState = (): EmptyByType => ({
  Series: false,
  Movie: false,
  Episode: false,
  Video: false,
  BoxSet: false,
  Playlist: false,
  Person: false,
});

/**
 * The Watchlist page body: page head "WATCHLIST · Favorites across your
 * libraries · n saved" and one rail per type on its type colour (series and
 * episodes yellow, movies orange, people and the rest volt).
 */
export const Favorites = () => {
  const router = useRouter();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const pageSize = 20;
  const [emptyState, setEmptyState] = useState<EmptyByType>(initialEmptyState);

  // Total across every favourite type for the page head; the rails only know
  // the pages they have loaded.
  const { data: savedCount, isLoading: countLoading } = useQuery({
    queryKey: ["home", "favorites", "count", user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api as Api).getItems({
        userId: user?.Id,
        filters: ["IsFavorite"],
        recursive: true,
        collapseBoxSetItems: false,
        excludeLocationTypes: ["Virtual"],
        enableTotalRecordCount: true,
        includeItemTypes: FAVORITE_ITEM_TYPES,
        limit: 0,
      });
      return response.data.TotalRecordCount ?? 0;
    },
    enabled: !!api && !!user?.Id,
    staleTime: 60 * 1000,
  });

  const fetchFavoritesByType = useCallback(
    async (
      itemType: BaseItemKind,
      startIndex: number = 0,
      limit: number = 20,
    ) => {
      const response = await getItemsApi(api as Api).getItems({
        userId: user?.Id,
        sortBy: ["SeriesSortName", "SortName"],
        sortOrder: ["Ascending"],
        filters: ["IsFavorite"],
        recursive: true,
        fields: ["PrimaryImageAspectRatio"],
        collapseBoxSetItems: false,
        excludeLocationTypes: ["Virtual"],
        enableTotalRecordCount: false,
        startIndex: startIndex,
        limit: limit,
        includeItemTypes: [itemType],
      });
      const items = response.data.Items || [];

      // Update empty state for this specific type only for the first page
      if (startIndex === 0) {
        setEmptyState((prev) => ({
          ...prev,
          [itemType as FavoriteTypes]: items.length === 0,
        }));
      }

      return items;
    },
    [api, user],
  );

  // Reset empty state when component mounts or dependencies change
  useEffect(() => {
    setEmptyState(initialEmptyState());
  }, [api, user]);

  // Check if all categories that have been loaded are empty
  const areAllEmpty = () => {
    const loadedCategories = Object.values(emptyState);
    return (
      loadedCategories.length > 0 &&
      loadedCategories.every((isEmpty) => isEmpty)
    );
  };

  const fetchFavoriteSeries = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Series", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteMovies = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Movie", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteEpisodes = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Episode", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteVideos = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Video", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteBoxsets = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("BoxSet", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoritePlaylists = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Playlist", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  // The persons endpoint has no start index, so people load as one page.
  const fetchFavoritePeople = useCallback(
    async ({ pageParam }: { pageParam: number }) => {
      if (pageParam > 0) return [];
      const response = await getPersonsApi(api as Api).getPersons({
        userId: user?.Id,
        isFavorite: true,
        limit: pageSize,
        fields: ["PrimaryImageAspectRatio"],
      });
      const items = response.data.Items || [];
      setEmptyState((prev) => ({ ...prev, Person: items.length === 0 }));
      return items;
    },
    [api, user, pageSize],
  );

  const handleSeeAllSeries = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Series", title: t("favorites.series") },
    } as any);
  }, [router]);

  const handleSeeAllMovies = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Movie", title: t("favorites.movies") },
    } as any);
  }, [router]);

  const handleSeeAllEpisodes = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Episode", title: t("favorites.episodes") },
    } as any);
  }, [router]);

  const handleSeeAllVideos = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Video", title: t("favorites.videos") },
    } as any);
  }, [router]);

  const handleSeeAllBoxsets = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "BoxSet", title: t("favorites.boxsets") },
    } as any);
  }, [router]);

  const handleSeeAllPlaylists = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Playlist", title: t("favorites.playlists") },
    } as any);
  }, [router]);

  const empty = areAllEmpty();

  return (
    <View style={{ backgroundColor: NeonBoard.stage }}>
      <LoadingLine active={countLoading} />
      <PageHead
        eyebrow={t("favorites.eyebrow")}
        title={t("tabs.favorites")}
        trailing={
          savedCount && savedCount > 0
            ? t("favorites.saved_count", { count: savedCount })
            : null
        }
      />
      {empty && (
        <EmptyState
          icon='heart'
          title={t("favorites.noDataTitle")}
          detail={t("favorites.noData")}
        />
      )}
      <View style={{ gap: 4, paddingBottom: 8 }}>
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteSeries}
          queryKey={["home", "favorites", "series"]}
          title={t("favorites.series")}
          accent={NeonBoard.yellow}
          hideIfEmpty
          pageSize={pageSize}
          onPressSeeAll={handleSeeAllSeries}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteMovies}
          queryKey={["home", "favorites", "movies"]}
          title={t("favorites.movies")}
          accent={NeonBoard.orange}
          hideIfEmpty
          orientation='vertical'
          pageSize={pageSize}
          onPressSeeAll={handleSeeAllMovies}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteEpisodes}
          queryKey={["home", "favorites", "episodes"]}
          title={t("favorites.episodes")}
          accent={NeonBoard.yellow}
          orientation='horizontal'
          hideIfEmpty
          pageSize={pageSize}
          onPressSeeAll={handleSeeAllEpisodes}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoritePeople}
          queryKey={["home", "favorites", "people"]}
          title={t("favorites.people")}
          accent={NeonBoard.volt}
          hideIfEmpty
          pageSize={pageSize}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteVideos}
          queryKey={["home", "favorites", "videos"]}
          title={t("favorites.videos")}
          accent={NeonBoard.volt}
          hideIfEmpty
          pageSize={pageSize}
          onPressSeeAll={handleSeeAllVideos}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteBoxsets}
          queryKey={["home", "favorites", "boxsets"]}
          title={t("favorites.boxsets")}
          accent={NeonBoard.volt}
          hideIfEmpty
          pageSize={pageSize}
          onPressSeeAll={handleSeeAllBoxsets}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoritePlaylists}
          queryKey={["home", "favorites", "playlists"]}
          title={t("favorites.playlists")}
          accent={NeonBoard.volt}
          hideIfEmpty
          pageSize={pageSize}
          onPressSeeAll={handleSeeAllPlaylists}
        />
      </View>
    </View>
  );
};
