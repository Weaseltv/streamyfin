import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemKind,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useLocalSearchParams, useSegments } from "expo-router";
import { useAtom } from "jotai";
import { orderBy, uniqBy } from "lodash";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, type TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import { Chip } from "@/components/common/Chip";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import { ItemCardText } from "@/components/ItemCardText";
import {
  JellyseerrSearchSort,
  JellyserrIndexPage,
} from "@/components/jellyseerr/JellyseerrIndexPage";
import MoviePoster from "@/components/posters/MoviePoster";
import SeriesPoster from "@/components/posters/SeriesPoster";
import {
  DiscoverFilters,
  type DiscoverMediaFilter,
} from "@/components/search/DiscoverFilters";
import { LoadingSkeleton } from "@/components/search/LoadingSkeleton";
import { SearchField } from "@/components/search/SearchField";
import { SearchItemWrapper } from "@/components/search/SearchItemWrapper";
import { SearchTabButtons } from "@/components/search/SearchTabButtons";
import { TVSearchPage } from "@/components/search/TVSearchPage";
import { PersonAvatar } from "@/components/series/CastAndCrew";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { usePageAccent, useSetPageAccent } from "@/utils/atoms/pageAccent";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { eventBus } from "@/utils/eventBus";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { createStreamystatsApi } from "@/utils/streamystats";

type SearchType = "Library" | "Discover";

const exampleSearches = [
  "Lord of the rings",
  "Avengers",
  "Game of Thrones",
  "Breaking Bad",
  "Stranger Things",
  "The Mandalorian",
];

export default function SearchPage() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(search)";

  const [user] = useAtom(userAtom);

  const { t } = useTranslation();

  const { q } = params as { q: string };

  const [searchType, setSearchType] = useState<SearchType>("Library");
  const [search, setSearch] = useState<string>("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Library search is cyan, the Requests side mint.
  const accent = sectionAccent(
    searchType === "Discover" ? "requests" : "search",
  );
  useSetPageAccent(Platform.isTV ? undefined : accent);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timeout);
  }, [search]);

  const [api] = useAtom(apiAtom);

  const { settings } = useSettings();
  const { jellyseerrApi } = useJellyseerr();
  const [jellyseerrOrderBy, setJellyseerrOrderBy] =
    useState<JellyseerrSearchSort>(
      JellyseerrSearchSort[
        JellyseerrSearchSort.DEFAULT
      ] as unknown as JellyseerrSearchSort,
    );
  const [jellyseerrSortOrder, setJellyseerrSortOrder] = useState<
    "asc" | "desc"
  >("desc");
  const [jellyseerrMediaFilter, setJellyseerrMediaFilter] =
    useState<DiscoverMediaFilter>(undefined);

  const searchEngine = useMemo(() => {
    return settings?.searchEngine || "Jellyfin";
  }, [settings]);

  useEffect(() => {
    if (q && q.length > 0) {
      setSearch(q);
    }
  }, [q]);

  const searchFn = useCallback(
    async ({
      types,
      query,
      signal,
    }: {
      types: BaseItemKind[];
      query: string;
      signal?: AbortSignal;
    }): Promise<BaseItemDto[]> => {
      if (!api || !query) {
        return [];
      }

      try {
        if (searchEngine === "Jellyfin") {
          const searchApi = await getItemsApi(api).getItems(
            {
              searchTerm: query,
              limit: 10,
              includeItemTypes: types,
              recursive: true,
              userId: user?.Id,
            },
            { signal },
          );

          return (searchApi.data.Items as BaseItemDto[]) || [];
        }

        if (searchEngine === "Streamystats") {
          if (!settings?.streamyStatsServerUrl || !api.accessToken) {
            return [];
          }

          const streamyStatsApi = createStreamystatsApi({
            serverUrl: settings.streamyStatsServerUrl,
            jellyfinToken: api.accessToken,
          });

          const typeMap: Record<BaseItemKind, string> = {
            Movie: "movies",
            Series: "series",
            Episode: "episodes",
            Person: "actors",
            BoxSet: "movies",
            Audio: "audio",
          } as Record<BaseItemKind, string>;

          const searchType = types.length === 1 ? typeMap[types[0]] : "media";
          const response = await streamyStatsApi.searchIds(
            query,
            searchType as "movies" | "series" | "episodes" | "actors" | "media",
            10,
            signal,
          );

          const allIds: string[] = [
            ...(response.data.movies || []),
            ...(response.data.series || []),
            ...(response.data.episodes || []),
            ...(response.data.actors || []),
            ...(response.data.audio || []),
          ];

          if (!allIds.length) {
            return [];
          }

          const itemsResponse = await getItemsApi(api).getItems(
            {
              ids: allIds,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
            },
            { signal },
          );

          return (itemsResponse.data.Items as BaseItemDto[]) || [];
        }

        // Marlin search
        if (!settings?.marlinServerUrl) {
          return [];
        }

        const url = `${settings.marlinServerUrl}/search?q=${encodeURIComponent(query)}&includeItemTypes=${types
          .map((type) => encodeURIComponent(type))
          .join("&includeItemTypes=")}`;

        const response1 = await axios.get(url, {
          signal,
          headers: getIntegrationHeaders("marlin"),
        });

        const ids = response1.data.ids;

        if (!ids?.length) {
          return [];
        }

        const response2 = await getItemsApi(api).getItems(
          {
            ids,
            enableImageTypes: ["Primary", "Backdrop", "Thumb"],
          },
          { signal },
        );

        return (response2.data.Items as BaseItemDto[]) || [];
      } catch (error) {
        // Silently handle aborted requests
        if (error instanceof Error && error.name === "AbortError") {
          return [];
        }
        return [];
      }
    },
    [api, searchEngine, settings, user?.Id],
  );

  // Separate search function for music types - always uses Jellyfin since Streamystats doesn't support music
  const jellyfinSearchFn = useCallback(
    async ({
      types,
      query,
      signal,
    }: {
      types: BaseItemKind[];
      query: string;
      signal?: AbortSignal;
    }): Promise<BaseItemDto[]> => {
      if (!api || !query) {
        return [];
      }

      try {
        const searchApi = await getItemsApi(api).getItems(
          {
            searchTerm: query,
            limit: 10,
            includeItemTypes: types,
            recursive: true,
            userId: user?.Id,
          },
          { signal },
        );

        return (searchApi.data.Items as BaseItemDto[]) || [];
      } catch (error) {
        // Silently handle aborted requests
        if (error instanceof Error && error.name === "AbortError") {
          return [];
        }
        return [];
      }
    },
    [api, user?.Id],
  );

  // The phone search strip (`SearchField`) under the page head. TV renders
  // its own input inside `TVSearchPage`.
  const searchFieldRef = useRef<TextInput>(null);

  // WeaselPlex: the Requests tab is where a customer goes when the library
  // search found nothing, so switching to it opens the keyboard straight away
  // and keeps whatever they already typed. Library keeps stock behaviour.
  const selectSearchType = useCallback((type: SearchType) => {
    setSearchType(type);
    if (type === "Discover") {
      searchFieldRef.current?.focus();
    }
  }, []);

  const onChangeSearch = useCallback(
    (text: string) => {
      router.setParams({ q: "" });
      setSearch(text);
    },
    [router],
  );

  useEffect(() => {
    const unsubscribe = eventBus.on("searchTabPressed", () => {
      // Screen not active
      if (!searchFieldRef.current) {
        return;
      }
      // Screen is active, focus the search field
      searchFieldRef.current?.focus();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const { data: movies, isFetching: l1 } = useQuery({
    queryKey: ["search", "movies", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Movie"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: series, isFetching: l2 } = useQuery({
    queryKey: ["search", "series", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Series"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: episodes, isFetching: l3 } = useQuery({
    queryKey: ["search", "episodes", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Episode"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: collections, isFetching: l7 } = useQuery({
    queryKey: ["search", "collections", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["BoxSet"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: actors, isFetching: l8 } = useQuery({
    queryKey: ["search", "actors", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Person"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  // Music search queries - always use Jellyfin since Streamystats doesn't support music
  const { data: artists, isFetching: l9 } = useQuery({
    queryKey: ["search", "artists", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicArtist"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: albums, isFetching: l10 } = useQuery({
    queryKey: ["search", "albums", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicAlbum"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: songs, isFetching: l11 } = useQuery({
    queryKey: ["search", "songs", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Audio"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: playlists, isFetching: l12 } = useQuery({
    queryKey: ["search", "playlists", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Playlist"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const noResults = useMemo(() => {
    return !(
      movies?.length ||
      episodes?.length ||
      series?.length ||
      collections?.length ||
      actors?.length ||
      artists?.length ||
      albums?.length ||
      songs?.length ||
      playlists?.length
    );
  }, [
    episodes,
    movies,
    series,
    collections,
    actors,
    artists,
    albums,
    songs,
    playlists,
  ]);

  const loading = useMemo(() => {
    return l1 || l2 || l3 || l7 || l8 || l9 || l10 || l11 || l12;
  }, [l1, l2, l3, l7, l8, l9, l10, l11, l12]);

  // TV item press handler
  const handleItemPress = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  // Jellyseerr search for TV
  const { data: jellyseerrTVResults, isFetching: jellyseerrTVLoading } =
    useQuery({
      queryKey: ["search", "jellyseerr", "tv", debouncedSearch],
      queryFn: async () => {
        const params = {
          query: new URLSearchParams(debouncedSearch || "").toString(),
        };
        return await Promise.all([
          jellyseerrApi?.search({ ...params, page: 1 }),
          jellyseerrApi?.search({ ...params, page: 2 }),
          jellyseerrApi?.search({ ...params, page: 3 }),
          jellyseerrApi?.search({ ...params, page: 4 }),
        ]).then((all) =>
          uniqBy(
            all.flatMap((v) => v?.results || []),
            "id",
          ),
        );
      },
      enabled:
        Platform.isTV &&
        !!jellyseerrApi &&
        searchType === "Discover" &&
        debouncedSearch.length > 0,
    });

  // Process Jellyseerr results for TV
  const jellyseerrMovieResults = useMemo(
    () =>
      orderBy(
        jellyseerrTVResults?.filter(
          (r) => r.mediaType === MediaType.MOVIE,
        ) as MovieResult[],
        [(m) => m?.title?.toLowerCase() === debouncedSearch.toLowerCase()],
        "desc",
      ),
    [jellyseerrTVResults, debouncedSearch],
  );

  const jellyseerrTvResults = useMemo(
    () =>
      orderBy(
        jellyseerrTVResults?.filter(
          (r) => r.mediaType === MediaType.TV,
        ) as TvResult[],
        [(t) => t?.name?.toLowerCase() === debouncedSearch.toLowerCase()],
        "desc",
      ),
    [jellyseerrTVResults, debouncedSearch],
  );

  const jellyseerrPersonResults = useMemo(
    () =>
      orderBy(
        jellyseerrTVResults?.filter(
          (r) => r.mediaType === "person",
        ) as PersonResult[],
        [(p) => p?.name?.toLowerCase() === debouncedSearch.toLowerCase()],
        "desc",
      ),
    [jellyseerrTVResults, debouncedSearch],
  );

  const jellyseerrTVNoResults = useMemo(() => {
    return (
      !jellyseerrMovieResults?.length &&
      !jellyseerrTvResults?.length &&
      !jellyseerrPersonResults?.length
    );
  }, [jellyseerrMovieResults, jellyseerrTvResults, jellyseerrPersonResults]);

  // Fetch discover settings for TV (when no search query in Discover mode)
  const { data: discoverSliders } = useQuery({
    queryKey: ["search", "jellyseerr", "discoverSettings", "tv"],
    queryFn: async () => jellyseerrApi?.discoverSettings(),
    enabled:
      Platform.isTV &&
      !!jellyseerrApi &&
      searchType === "Discover" &&
      debouncedSearch.length === 0,
  });

  // TV Jellyseerr press handlers
  const handleJellyseerrMoviePress = useCallback(
    (item: MovieResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/jellyseerr/page",
        params: {
          mediaTitle: item.title,
          releaseYear: String(new Date(item.releaseDate || "").getFullYear()),
          canRequest: "true",
          posterSrc: jellyseerrApi?.imageProxy(item.posterPath) || "",
          mediaType: MediaType.MOVIE,
          id: String(item.id),
          backdropPath: item.backdropPath || "",
          overview: item.overview || "",
        },
      });
    },
    [router, jellyseerrApi],
  );

  const handleJellyseerrTvPress = useCallback(
    (item: TvResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/jellyseerr/page",
        params: {
          mediaTitle: item.name,
          releaseYear: String(new Date(item.firstAirDate || "").getFullYear()),
          canRequest: "true",
          posterSrc: jellyseerrApi?.imageProxy(item.posterPath) || "",
          mediaType: MediaType.TV,
          id: String(item.id),
          backdropPath: item.backdropPath || "",
          overview: item.overview || "",
        },
      });
    },
    [router, jellyseerrApi],
  );

  const handleJellyseerrPersonPress = useCallback(
    (item: PersonResult) => {
      router.push(`/(auth)/jellyseerr/person/${item.id}` as any);
    },
    [router],
  );

  // Render TV search page
  if (Platform.isTV) {
    return (
      <TVSearchPage
        search={search}
        setSearch={setSearch}
        debouncedSearch={debouncedSearch}
        movies={movies}
        series={series}
        episodes={episodes}
        collections={collections}
        actors={actors}
        artists={artists}
        albums={albums}
        songs={songs}
        playlists={playlists}
        loading={loading}
        noResults={noResults}
        onItemPress={handleItemPress}
        onItemLongPress={showItemActions}
        searchType={searchType}
        setSearchType={setSearchType}
        showDiscover={!!jellyseerrApi}
        jellyseerrMovies={jellyseerrMovieResults}
        jellyseerrTv={jellyseerrTvResults}
        jellyseerrPersons={jellyseerrPersonResults}
        jellyseerrLoading={jellyseerrTVLoading}
        jellyseerrNoResults={jellyseerrTVNoResults}
        onJellyseerrMoviePress={handleJellyseerrMoviePress}
        onJellyseerrTvPress={handleJellyseerrTvPress}
        onJellyseerrPersonPress={handleJellyseerrPersonPress}
        discoverSliders={discoverSliders}
      />
    );
  }

  const resultCount =
    (movies?.length ?? 0) +
    (series?.length ?? 0) +
    (episodes?.length ?? 0) +
    (collections?.length ?? 0) +
    (actors?.length ?? 0) +
    (artists?.length ?? 0) +
    (albums?.length ?? 0) +
    (songs?.length ?? 0) +
    (playlists?.length ?? 0);

  const showCount =
    searchType === "Library" && debouncedSearch.length > 0 && !loading;

  const eyebrow =
    searchType === "Discover"
      ? t("search.discover_eyebrow")
      : t("search.library_eyebrow");

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <LoadingLine
        accent={accent}
        active={searchType === "Library" && loading}
      />
      <ScrollView
        keyboardDismissMode='on-drag'
        keyboardShouldPersistTaps='handled'
        contentInsetAdjustmentBehavior='automatic'
        stickyHeaderIndices={[1]}
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: 60,
        }}
      >
        <PageHead
          eyebrow={eyebrow}
          title={t("tabs.search")}
          accent={accent}
          trailing={
            showCount
              ? t("search.n_results", { count: resultCount })
              : undefined
          }
        />
        <SearchField
          ref={searchFieldRef}
          value={search}
          onChangeText={onChangeSearch}
          placeholder={t("search.search")}
          accent={accent}
        />

        {jellyseerrApi && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              paddingHorizontal: Sizes.gutter,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: NeonBoard.line,
            }}
          >
            <SearchTabButtons
              searchType={searchType}
              setSearchType={selectSearchType}
              t={t}
            />
            {searchType === "Discover" && (
              <DiscoverFilters
                mediaFilter={jellyseerrMediaFilter}
                setMediaFilter={setJellyseerrMediaFilter}
                showSort={debouncedSearch.length > 0}
                jellyseerrOrderBy={jellyseerrOrderBy}
                setJellyseerrOrderBy={setJellyseerrOrderBy}
                jellyseerrSortOrder={jellyseerrSortOrder}
                setJellyseerrSortOrder={setJellyseerrSortOrder}
                t={t}
              />
            )}
          </View>
        )}

        {searchType === "Library" && (
          <View style={{ marginTop: 4 }}>
            <LoadingSkeleton isLoading={loading} />
          </View>
        )}

        {searchType === "Library" ? (
          <View style={{ opacity: loading ? 0 : 1 }}>
            <SearchItemWrapper
              header={t("search.movies")}
              accent={NeonBoard.orange}
              items={movies}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  key={item.Id}
                  item={item}
                  style={{ width: Sizes.posterSmall.w }}
                >
                  <MoviePoster item={item} size='small' />
                  <ItemCardText item={item} />
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={series}
              header={t("search.series")}
              accent={NeonBoard.yellow}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  key={item.Id}
                  item={item}
                  style={{ width: Sizes.posterSmall.w }}
                >
                  <SeriesPoster item={item} size='small' />
                  <ItemCardText item={item} />
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={episodes}
              header={t("search.episodes")}
              accent={NeonBoard.yellow}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  item={item}
                  key={item.Id}
                  style={{ width: Sizes.thumbSmall.w }}
                >
                  <ContinueWatchingPoster item={item} size='small' />
                  <ItemCardText item={item} />
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={collections}
              header={t("search.collections")}
              accent={accent}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  key={item.Id}
                  item={item}
                  style={{ width: Sizes.posterSmall.w }}
                >
                  <MoviePoster item={item} size='small' badge={null} />
                  <ItemCardText item={item} />
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={actors}
              header={t("search.actors")}
              accent={accent}
              renderItem={(item: BaseItemDto) => (
                <PersonAvatar
                  key={item.Id}
                  person={item as BaseItemPerson}
                  onPress={() => handleItemPress(item)}
                />
              )}
            />
            {/* Music search results */}
            <SearchItemWrapper
              items={artists}
              header={t("search.artists")}
              accent={accent}
              renderItem={(item: BaseItemDto) => (
                <PersonAvatar
                  key={item.Id}
                  person={item as BaseItemPerson}
                  onPress={() => handleItemPress(item)}
                />
              )}
            />
            <SearchItemWrapper
              items={albums}
              header={t("search.albums")}
              accent={accent}
              renderItem={(item: BaseItemDto) => (
                <MusicCard
                  key={item.Id}
                  item={item}
                  url={getPrimaryImageUrl({ api, item })}
                  glyph='disc'
                  meta={item.AlbumArtist || item.Artists?.join(", ")}
                />
              )}
            />
            <SearchItemWrapper
              items={songs}
              header={t("search.songs")}
              accent={accent}
              renderItem={(item: BaseItemDto) => (
                <MusicCard
                  key={item.Id}
                  item={item}
                  url={getPrimaryImageUrl({ api, item })}
                  glyph='music'
                  meta={item.Artists?.join(", ") || item.AlbumArtist}
                />
              )}
            />
            <SearchItemWrapper
              items={playlists}
              header={t("search.playlists")}
              accent={accent}
              renderItem={(item: BaseItemDto) => (
                <MusicCard
                  key={item.Id}
                  item={item}
                  url={getPrimaryImageUrl({ api, item })}
                  glyph='list'
                  meta={
                    item.ChildCount !== undefined && item.ChildCount !== null
                      ? t("search.x_items", { count: item.ChildCount })
                      : undefined
                  }
                />
              )}
            />
          </View>
        ) : (
          <JellyserrIndexPage
            searchQuery={debouncedSearch}
            sortType={jellyseerrOrderBy}
            order={jellyseerrSortOrder}
            mediaTypeFilter={jellyseerrMediaFilter}
            showDiscover={false}
          />
        )}

        {searchType === "Library" &&
          (!loading && noResults && debouncedSearch.length > 0 ? (
            <SearchEmpty query={debouncedSearch} />
          ) : debouncedSearch.length === 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                paddingHorizontal: Sizes.gutter,
                paddingTop: 16,
              }}
            >
              {exampleSearches.map((e) => (
                <Chip key={e} label={e} onPress={() => setSearch(e)} />
              ))}
            </View>
          ) : null)}
      </ScrollView>
    </View>
  );
}

/** "No results found for" + the query in the page accent, centred on the stage. */
export const SearchEmpty: React.FC<{ query: string }> = ({ query }) => {
  const { t } = useTranslation();
  const accent = usePageAccent();
  return (
    <View style={{ alignItems: "center", paddingTop: 24 }}>
      <Text variant='section'>{t("search.no_results_found_for")}</Text>
      <Text variant='meta' accent={accent} style={{ marginTop: 4 }}>
        "{query}"
      </Text>
    </View>
  );
};

/** A 96 square art card for albums, songs and playlists (no board; tokens only). */
const MusicCard: React.FC<{
  item: BaseItemDto;
  url?: string | null;
  glyph: keyof typeof Feather.glyphMap;
  meta?: string | null;
}> = ({ item, url, glyph, meta }) => {
  const size = Sizes.posterSmall.w;
  return (
    <TouchableItemRouter item={item} style={{ width: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderWidth: 1,
          borderColor: NeonBoard.line,
          backgroundColor: NeonBoard.card2,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
          />
        ) : (
          <Feather name={glyph} size={24} color={NeonBoard.low} />
        )}
      </View>
      <View style={{ marginTop: 6 }}>
        <Text variant='cardTitle' numberOfLines={1}>
          {item.Name}
        </Text>
        {meta ? (
          <Text variant='meta' muted numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </TouchableItemRouter>
  );
};
