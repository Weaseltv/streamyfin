import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getFilterApi,
  getItemsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import {
  type Query,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Platform,
  RefreshControl,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import {
  type QuickList,
  QuickListRow,
  TypeButtonRow,
} from "@/components/common/BrowseButtonRows";
import { Chip } from "@/components/common/Chip";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import { FilterButton } from "@/components/filters/FilterButton";
import { ItemCardText } from "@/components/ItemCardText";
import { Loader } from "@/components/Loader";
import { LibraryAlphabetPicker } from "@/components/library/LibraryAlphabetPicker";
import { ItemPoster } from "@/components/posters/ItemPoster";
import { StreamingServiceHeader } from "@/components/streaming/StreamingServiceHeader";
import { TVFilterButton } from "@/components/tv";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { NeonBoard } from "@/constants/Colors";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import useRouter from "@/hooks/useAppRouter";
import { useAvailableItemFilters } from "@/hooks/useAvailableItemFilters";
import { useManualRefresh } from "@/hooks/useManualRefresh";
import { useRefreshLibraryOnFocus } from "@/hooks/useRefreshLibraryOnFocus";
import { useTappedCard } from "@/hooks/useTappedCard";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  SortByOption,
  SortOrderOption,
  sortOptions,
  sortOrderOptions,
} from "@/utils/atoms/filters";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import {
  cachedJustWatchLists,
  cachedServiceCodes,
  JUSTWATCH_STREAMING_PREFS,
  loadRankedItems,
} from "@/utils/justWatchLists";
import {
  ALPHABET_RAIL_WIDTH,
  getLibraryLetter,
  getNextLibraryPage,
  getPreviousLibraryPage,
} from "@/utils/libraryAlphabet";
import { useNavTimingStage } from "@/utils/navTiming";
import {
  isPendingTile,
  nearLoadedEnd,
  pagedGridAhead,
} from "@/utils/pagedGrid";
import { holdsSinglePage, trimToFirstPage } from "@/utils/query/firstPageOnly";
import { loadRandomItem } from "@/utils/randomItem";
import {
  loadStreamingCollectionAlphabet,
  loadStreamingCollectionItems,
  STREAMING_COLLECTION_TAG,
  type StreamingMediaType,
  streamingService,
  streamingServiceCode,
} from "@/utils/streamingCollections";

/** What a collection's ALL / MOVIES / SHOWS list, as on the TV (SHOWS takes episodes too). */
const collectionTypes = (mediaType: StreamingMediaType): BaseItemKind[] =>
  mediaType === "Movie"
    ? ["Movie"]
    : mediaType === "Series"
      ? ["Series", "Season", "Episode"]
      : ["Movie", "Series", "Season", "Episode", "Video", "BoxSet"];

const TV_ITEM_GAP = 16;
const TV_SCALE_PADDING = 20;

const page: React.FC = () => {
  const searchParams = useLocalSearchParams();
  const { collectionId } = searchParams as { collectionId: string };

  const posterSizes = useScaledTVPosterSizes();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const router = useRouter();
  const { showOptions } = useTVOptionModal();
  const { showItemActions } = useTVItemActionModal();
  const { width: screenWidth } = useWindowDimensions();
  const [orientation, _setOrientation] = useState(
    ScreenOrientation.Orientation.PORTRAIT_UP,
  );

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mediaType, setMediaType] = useState<StreamingMediaType>("All");
  // Streaming pages: POPULAR / TRENDING / TOP 10 / NEW, NEW by default (TV)
  const [quickList, setQuickList] = useState<QuickList>("NEW");
  const [randomBusy, setRandomBusy] = useState(false);
  const [sortBy, setSortBy] = useState<SortByOption[]>([
    SortByOption.PremiereDate,
  ]);
  const [sortOrder, setSortOrder] = useState<SortOrderOption[]>([
    SortOrderOption.Ascending,
  ]);

  const {
    data: fetchedCollection,
    isLoading: collectionLoading,
    isError: collectionError,
    isFetching: fetchingCollection,
    refetch: refetchCollection,
  } = useQuery({
    queryKey: ["collection", api?.basePath, user?.Id, collectionId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getUserLibraryApi(api).getItem({
        itemId: collectionId,
        userId: user?.Id,
      });
      const data = response.data;
      return data;
    },
    enabled: !!api && !!user?.Id && !!collectionId,
    // Kept like any other item, so a return visit draws at once and is
    // refreshed in the background. (Phones dropped it on close for the
    // curated-row reordering removed on 2026-10-18.)
    staleTime: 60_000,
  });
  // Phones: a Streaming Services card on Home already holds everything this
  // page reads from its collection (name, description and the tag that says
  // it is a streaming service). Opened from that card, the page draws its
  // head and asks for its titles at once instead of after the collection's
  // own request, whose answer replaces the card when it arrives. No other
  // card is used: a Collections grid card comes without tags, so it cannot
  // say which kind of page this is.
  const tappedService = useTappedCard(
    "collection",
    collectionId,
    !Platform.isTV,
  );
  const collection = fetchedCollection ?? tappedService;
  const isCollectionLoading = collectionLoading && !collection;

  // TV Filter queries
  const { data: tvGenreOptions } = useQuery({
    queryKey: ["filters", "Genres", "tvGenreFilter", collectionId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: collectionId,
      });
      return response.data.Genres || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!collectionId,
  });

  const { data: tvYearOptions } = useQuery({
    queryKey: ["filters", "Years", "tvYearFilter", collectionId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: collectionId,
      });
      return response.data.Years || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!collectionId,
  });

  const { data: tvTagOptions } = useQuery({
    queryKey: ["filters", "Tags", "tvTagFilter", collectionId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: collectionId,
      });
      return response.data.Tags || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!collectionId,
  });

  const isStreaming =
    !Platform.isTV &&
    collection?.Tags?.includes(STREAMING_COLLECTION_TAG) === true;
  const defaultSortBy =
    !isStreaming && collection?.DisplayOrder
      ? SortByOption[collection.DisplayOrder as keyof typeof SortByOption] ||
        SortByOption.PremiereDate
      : SortByOption.PremiereDate;
  const defaultSortOrder = isStreaming
    ? SortOrderOption.Descending
    : SortOrderOption.Ascending;
  // A streaming service's brand colour drives its page's buttons, as on the
  // TV; other collections are in the Collections yellow.
  const service = isStreaming ? streamingService(collection?.Name) : null;
  const accent = isStreaming
    ? (service?.brand ?? NeonBoard.volt)
    : NeonBoard.collections;
  useSetPageAccent(accent, !!collection);
  // The code keying its POPULAR / TRENDING / TOP 10, from the server's
  // `service_codes` (owner, 2026-10-16: new services need no app release);
  // the built-in table until they're read, or if they can't be
  const { data: serverCodes } = useQuery({
    queryKey: ["streaming-service-codes", api?.basePath, user?.Id],
    queryFn: () => (api && user?.Id ? cachedServiceCodes(api, user.Id) : null),
    enabled: isStreaming && !!api && !!user?.Id,
    staleTime: 5 * 60 * 1000,
  });
  const listCode =
    isStreaming && collection
      ? streamingServiceCode(collection, serverCodes)
      : null;
  const [filterScope, setFilterScope] = useState<string | null>(null);
  useEffect(() => {
    if (!collection || filterScope === collectionId) return;
    setSelectedGenres([]);
    setSelectedYears([]);
    setSelectedTags([]);
    setMediaType("All");
    setQuickList("NEW");
    setSortBy([defaultSortBy]);
    setSortOrder([defaultSortOrder]);
    setFilterScope(collectionId);
  }, [collectionId, collection, defaultSortBy, defaultSortOrder, filterScope]);

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: collection?.Name || "" });
    }, [navigation, collection?.Name]),
  );

  const { data: availableFilters } = useAvailableItemFilters(
    collectionId,
    !Platform.isTV && !!collection && !isStreaming,
  );
  const hasActiveFilters =
    selectedGenres.length > 0 ||
    selectedYears.length > 0 ||
    selectedTags.length > 0 ||
    mediaType !== "All" ||
    sortBy[0] !== defaultSortBy ||
    sortOrder[0] !== defaultSortOrder;
  const resetCollectionFilters = useCallback(() => {
    setSelectedGenres([]);
    setSelectedYears([]);
    setSelectedTags([]);
    setMediaType("All");
    setSortBy([defaultSortBy]);
    setSortOrder([defaultSortOrder]);
  }, [defaultSortBy, defaultSortOrder]);

  // A streaming service's list costs the server about two seconds per request
  // however many titles are asked for: 1.9 to 2.2 s for 18, 60, 300 and all
  // 1,890 of one service (measured 2026-11-12), and several times that when
  // other viewers are browsing. So phones make few, large requests: 300 titles
  // at a time. The list as first opened starts with a small page of 60, which
  // keeps its saved copy and its minute refresh light.
  const pageSize = Platform.isTV ? 36 : isStreaming ? 300 : 18;
  const firstPageSize = isStreaming ? 60 : pageSize;
  const ranked = isStreaming && !!listCode && quickList !== "NEW";
  const nameSorted =
    isStreaming && !ranked && sortBy[0] === SortByOption.SortName;
  const filterSignature = JSON.stringify([
    api?.basePath,
    user?.Id,
    collectionId,
    mediaType,
    sortBy,
    sortOrder,
  ]);
  const [jump, setJump] = useState<{ signature: string; startIndex: number }>();
  const jumpStart =
    nameSorted && jump?.signature === filterSignature ? jump.startIndex : 0;
  const flashListRef = useRef<FlashListRef<BaseItemDto>>(null);
  const pendingJumpRef = useRef<string | undefined>(undefined);
  const [activeLetter, setActiveLetter] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [railTop, setRailTop] = useState(0);
  const scrollOffsetRef = useRef(0);
  useEffect(() => {
    setRailTop(Math.max(0, headerHeight - scrollOffsetRef.current) + 8);
  }, [headerHeight]);

  // Calculate columns for TV grid
  const nrOfCols = useMemo(() => {
    if (Platform.isTV) {
      const itemWidth = posterSizes.poster + TV_ITEM_GAP;
      return Math.max(
        1,
        Math.floor((screenWidth - TV_SCALE_PADDING * 2) / itemWidth),
      );
    }
    return orientation === ScreenOrientation.Orientation.PORTRAIT_UP ? 3 : 5;
  }, [screenWidth, orientation]);

  // Each poster fills its column's 89 % cell, so narrow phones don't clip it
  const posterWidth = Math.floor((screenWidth / nrOfCols) * 0.89);

  const fetchItems = useCallback(
    async ({
      pageParam,
      signal,
    }: {
      pageParam: number;
      signal: AbortSignal;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!api || !user?.Id || !collection) return null;

      if (isStreaming)
        return loadStreamingCollectionItems(api, user.Id, collectionId, {
          mediaType,
          sortBy: sortBy[0],
          sortOrder: sortOrder[0],
          startIndex: pageParam,
          // The list's first 60 titles are always their own page, unless a
          // jump landed a full page or more down (see jumpToLetter), so the
          // pages before and after a jump line up without overlapping.
          limit:
            pageParam === 0 && jumpStart <= firstPageSize
              ? firstPageSize
              : pageSize,
          signal,
        });

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        parentId: collectionId,
        limit: pageSize,
        startIndex: pageParam,
        // Set one ordering at a time. As collections do not work with correctly with multiple.
        sortBy: [sortBy[0]],
        sortOrder: [sortOrder[0]],
        fields: [
          "ItemCounts",
          "PrimaryImageAspectRatio",
          "CanDelete",
          "MediaSourceCount",
        ],
        // The collection's own members, as on the TV. Recursing also
        // returned every season of every show in it, and its "Top 25
        // Episodes" collections hold episodes.
        recursive: false,
        genres: selectedGenres,
        tags: selectedTags,
        years: selectedYears.map((year) => Number.parseInt(year, 10)),
        includeItemTypes: collectionTypes(mediaType),
      });

      return response.data || null;
    },
    [
      api,
      user?.Id,
      collection,
      collectionId,
      selectedGenres,
      selectedYears,
      selectedTags,
      sortBy,
      sortOrder,
      isStreaming,
      mediaType,
      pageSize,
      firstPageSize,
      jumpStart,
    ],
  );

  const {
    data,
    fetchNextPage,
    hasNextPage,
    fetchPreviousPage,
    hasPreviousPage,
    isLoading,
    isFetching,
    refetch,
    isError: itemsError,
  } = useInfiniteQuery({
    queryKey: [
      "collection-items",
      api?.basePath,
      user?.Id,
      collectionId,
      isStreaming,
      mediaType,
      selectedGenres,
      selectedYears,
      selectedTags,
      sortBy,
      sortOrder,
      jumpStart,
    ],
    queryFn: fetchItems,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      getNextLibraryPage(lastPage, lastPageParam),
    getPreviousPageParam: (_firstPage, _pages, firstPageParam) =>
      nameSorted ? getPreviousLibraryPage(firstPageParam, pageSize) : undefined,
    initialPageParam: jumpStart,
    staleTime: 60_000,
    // A streaming page left open at its top follows the server each minute.
    // Refreshing replays every loaded page in turn and nothing more can load
    // meanwhile, so a page scrolled past its first page is left alone.
    refetchInterval: (query) =>
      isStreaming && isFocused && holdsSinglePage(query.state.data)
        ? 60_000
        : false,
    enabled:
      !ranked &&
      !!api &&
      !!user?.Id &&
      !!collection &&
      filterScope === collectionId,
  });

  // POPULAR / TRENDING / TOP 10: the lists the media server saves for every
  // member (`justwatch-streaming`), in ranked order, filtered by type here;
  // TOP 10 is the first 10 after the type filter, as on the TV.
  const { data: rankedItems, isFetching: rankedFetching } = useQuery({
    queryKey: [
      "collection-ranked",
      api?.basePath,
      user?.Id,
      collectionId,
      quickList,
      listCode,
    ],
    queryFn: async ({ signal }) => {
      if (!api || !user?.Id || !listCode) return [];
      const lists = await cachedJustWatchLists(
        api,
        user.Id,
        JUSTWATCH_STREAMING_PREFS,
      );
      const ids = lists[`service_${quickList.toLowerCase()}_${listCode}`] ?? [];
      return loadRankedItems(api, user.Id, ids, ids.length, signal);
    },
    enabled: ranked && !!api && !!user?.Id,
    staleTime: 5 * 60 * 1000,
  });
  const rankedVisible = useMemo(() => {
    const items = (rankedItems ?? []).filter(
      (item) => mediaType === "All" || item.Type === mediaType,
    );
    return quickList === "TOP_10" ? items.slice(0, 10) : items;
  }, [rankedItems, mediaType, quickList]);

  // RANDOM: one random title from the server with this page's filters, opened
  // (never played), as on the TV
  const openRandom = useCallback(async () => {
    if (!api || !user?.Id || randomBusy) return;
    setRandomBusy(true);
    try {
      const item = await loadRandomItem(api, {
        userId: user.Id,
        parentId: collectionId,
        recursive: false,
        includeItemTypes: isStreaming
          ? mediaType === "All"
            ? ["Movie", "Series"]
            : [mediaType]
          : collectionTypes(mediaType),
        ...(isStreaming
          ? {}
          : {
              genres: selectedGenres,
              tags: selectedTags,
              years: selectedYears.map((year) => Number.parseInt(year, 10)),
            }),
      });
      if (item) router.push(getItemNavigation(item, "(home)") as any);
    } finally {
      setRandomBusy(false);
    }
  }, [
    api,
    user?.Id,
    randomBusy,
    collectionId,
    isStreaming,
    mediaType,
    selectedGenres,
    selectedTags,
    selectedYears,
    router,
  ]);

  const collectionKeys = useMemo(
    () => [["collection-items", api?.basePath, user?.Id, collectionId]],
    [api?.basePath, user?.Id, collectionId],
  );
  const streamingRef = useRef(isStreaming);
  streamingRef.current = isStreaming;
  // Returning to a streaming page refreshes it on the same condition
  const refreshOnReturn = useCallback(
    (query: Query) =>
      !streamingRef.current || holdsSinglePage(query.state.data),
    [],
  );
  useRefreshLibraryOnFocus(collectionKeys, 60_000, refreshOnReturn);
  // A closed streaming page keeps its first page only, so the next visit
  // refreshes one page rather than everything that was scrolled through
  useEffect(() => {
    const [queryKey] = collectionKeys;
    return () => {
      if (streamingRef.current) trimToFirstPage(queryClient, queryKey);
    };
  }, [queryClient, collectionKeys]);

  const flatData = useMemo(() => {
    if (ranked) return rankedVisible;
    return (
      (data?.pages.flatMap((p) => p?.Items).filter(Boolean) as BaseItemDto[]) ||
      []
    );
  }, [data, ranked, rankedVisible]);

  useNavTimingStage("collection", collectionId, "content", !!collection);
  useNavTimingStage("collection", collectionId, "full", flatData.length > 0);

  // Phones: a tile for each title of the next page, so a fast scroll runs on
  // over them instead of stopping at the last loaded title. Left out when the
  // last request failed, so the list ends where the titles do.
  const ahead = useMemo(
    () =>
      ranked || itemsError
        ? { firstIndex: 0, pending: [] }
        : pagedGridAhead(data, firstPageSize, !!hasNextPage),
    [ranked, itemsError, data, firstPageSize, hasNextPage],
  );
  const listData = useMemo(
    () => (ahead.pending.length ? [...flatData, ...ahead.pending] : flatData),
    [flatData, ahead.pending],
  );
  // The next page is asked for while the viewer is still well short of the
  // last loaded title, and again for as long as they stay that close. Read
  // through a ref so scrolling does not re-render the page.
  const lastVisibleRef = useRef(0);
  const loadAhead = useRef({
    canLoad: false,
    loaded: 0,
    pageSize,
    fetchNextPage,
  });
  loadAhead.current = {
    canLoad: !ranked && !!hasNextPage && !isFetching && !itemsError,
    loaded: flatData.length,
    pageSize,
    fetchNextPage,
  };
  const loadMoreIfNear = useCallback(() => {
    const state = loadAhead.current;
    if (
      state.canLoad &&
      nearLoadedEnd(lastVisibleRef.current, state.loaded, state.pageSize)
    ) {
      void state.fetchNextPage({ cancelRefetch: false });
    }
  }, []);

  const {
    data: alphabet,
    isFetching: isAlphabetFetching,
    isError: alphabetError,
    refetch: refetchAlphabet,
  } = useQuery({
    queryKey: ["collection-alphabet", filterSignature],
    queryFn: ({ signal }) => {
      if (!api || !user?.Id) throw new Error("No collection server available");
      return loadStreamingCollectionAlphabet(
        api,
        user.Id,
        collectionId,
        mediaType,
        sortOrder[0],
        signal,
      );
    },
    enabled: nameSorted && !!api && !!user?.Id && filterScope === collectionId,
    staleTime: 60_000,
    refetchInterval: nameSorted && isFocused ? 60_000 : false,
  });
  const { refreshing, onRefresh } = useManualRefresh(() => {
    // Pulling down on a streaming page starts again from its first page
    // rather than replaying every loaded page
    if (isStreaming) trimToFirstPage(queryClient, collectionKeys[0]);
    return Promise.all([
      refetch({ throwOnError: true }),
      nameSorted ? refetchAlphabet({ throwOnError: true }) : undefined,
    ]);
  });
  const showAlphabet =
    nameSorted &&
    (data?.pages[0]?.TotalRecordCount ?? alphabet?.totalCount ?? 0) >
      (Platform.isTV ? 36 : 18);
  const availableLetters = useMemo(
    () => alphabet?.entries.map((entry) => entry.letter) ?? [],
    [alphabet],
  );
  const scrollToPendingLetter = useCallback(() => {
    const id = pendingJumpRef.current;
    if (!id || isFetching) return;
    const index = flatData.findIndex((item) => item.Id === id);
    if (index < 0) {
      // Monday's membership refresh can move/remove an indexed title.
      if (data?.pages.length && !itemsError) {
        pendingJumpRef.current = undefined;
        setJump(undefined);
        void refetchAlphabet();
      }
      return;
    }
    if (!flashListRef.current) return;
    pendingJumpRef.current = undefined;
    void flashListRef.current.scrollToIndex({
      index,
      animated: false,
      viewPosition: 0,
    });
  }, [flatData, isFetching, data, itemsError, refetchAlphabet]);
  const jumpToLetter = useCallback(
    (letter: string) => {
      const entry = alphabet?.entries.find((entry) => entry.letter === letter);
      if (!entry) return;
      pendingJumpRef.current = entry.itemId;
      setActiveLetter(letter);
      const index = flatData.findIndex((item) => item.Id === entry.itemId);
      if (index >= 0 && flashListRef.current) {
        pendingJumpRef.current = undefined;
        void flashListRef.current.scrollToIndex({
          index,
          animated: false,
          viewPosition: 0,
        });
      } else {
        // Open at the page holding the letter: the small first page, the
        // page straight after it, or a full page further down.
        setJump({
          signature: filterSignature,
          startIndex:
            entry.index < firstPageSize
              ? 0
              : entry.index < pageSize
                ? firstPageSize
                : Math.floor(entry.index / pageSize) * pageSize,
        });
      }
    },
    [alphabet, flatData, filterSignature, pageSize, firstPageSize],
  );
  useEffect(scrollToPendingLetter, [scrollToPendingLetter]);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<BaseItemDto>[] }) => {
      let last = -1;
      for (const entry of viewableItems) {
        if (entry.isViewable && (entry.index ?? -1) > last) last = entry.index!;
      }
      if (last >= 0) {
        lastVisibleRef.current = last;
        loadMoreIfNear();
      }
      if (pendingJumpRef.current) return;
      // A tile for a title not loaded yet has no name to take a letter from
      const first = viewableItems.find(
        (entry) => entry.isViewable && !isPendingTile(entry.item),
      );
      if (first) setActiveLetter(getLibraryLetter(first.item));
    },
    [loadMoreIfNear],
  );
  // A new list starts from its top; a page that has just arrived may already
  // be too few for where the viewer is.
  useEffect(() => {
    lastVisibleRef.current = 0;
  }, [filterSignature, ranked]);
  useEffect(loadMoreIfNear, [
    loadMoreIfNear,
    isFetching,
    hasNextPage,
    flatData.length,
  ]);
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;
  const pendingScrollTopRef = useRef(false);
  useEffect(() => {
    if (!isStreaming) return;
    setJump(undefined);
    setPickerOpen(false);
    setActiveLetter(undefined);
    pendingJumpRef.current = undefined;
    flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    pendingScrollTopRef.current = true;
  }, [filterSignature, isStreaming]);
  useEffect(() => {
    if (pendingScrollTopRef.current && !isFetching) {
      pendingScrollTopRef.current = false;
      flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [isFetching, flatData]);

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => {
      const cell = {
        width: "100%",
        marginBottom:
          orientation === ScreenOrientation.Orientation.PORTRAIT_UP ? 4 : 16,
      } as const;
      const column = {
        alignSelf:
          index % 3 === 0
            ? "flex-end"
            : (index + 1) % 3 === 0
              ? "flex-start"
              : "center",
        width: "89%",
      } as const;
      // A title not loaded yet: an empty card of the same size, not tappable
      if (isPendingTile(item)) {
        return (
          <View style={cell}>
            <View style={column}>
              <View
                style={{
                  width: posterWidth,
                  height: Math.round((posterWidth * 15) / 10),
                  borderWidth: 1,
                  borderColor: NeonBoard.line,
                  backgroundColor: NeonBoard.card2,
                }}
              />
              <View className='mt-1.5 flex flex-col'>
                <Text variant='cardTitle'> </Text>
                <Text variant='meta'> </Text>
              </View>
            </View>
          </View>
        );
      }
      return (
        <TouchableItemRouter key={item.Id} style={cell} item={item}>
          <View style={column}>
            <ItemPoster item={item} width={posterWidth} />
            <ItemCardText item={item} />
          </View>
        </TouchableItemRouter>
      );
    },
    [orientation, posterWidth],
  );

  const renderTVItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      const handlePress = () => {
        const navTarget = getItemNavigation(item, "(home)");
        router.push(navTarget as any);
      };

      return (
        <View
          style={{
            marginRight: TV_ITEM_GAP,
            marginBottom: TV_ITEM_GAP,
          }}
        >
          <TVPosterCard
            item={item}
            orientation='vertical'
            onPress={handlePress}
            onLongPress={() => showItemActions(item)}
            width={posterSizes.poster}
          />
        </View>
      );
    },
    [router, showItemActions, posterSizes.poster],
  );

  const keyExtractor = useCallback((item: BaseItemDto) => item.Id || "", []);
  // Phone grid: a cell is keyed by its place in the whole list, so a tile and
  // the title that replaces it are the same cell and the grid holds its place
  // when a page arrives (as it already does when an earlier page loads). The
  // ranked lists are not paged and keep their ids.
  const gridKeyExtractor = useCallback(
    (item: BaseItemDto, index: number) =>
      ranked ? item.Id || String(index) : String(ahead.firstIndex + index),
    [ranked, ahead.firstIndex],
  );
  const gridItemType = useCallback(
    (item: BaseItemDto) => (isPendingTile(item) ? "pending" : "title"),
    [],
  );

  const listHeader = useMemo(
    () => (
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          display: "flex",
          paddingHorizontal: 15,
          paddingVertical: 16,
          flexDirection: "row",
        }}
        data={[
          {
            key: "alphabet",
            component: showAlphabet ? (
              <Chip
                label='A–Z'
                accent={accent}
                onPress={() => setPickerOpen(true)}
              />
            ) : null,
          },
          {
            key: "reset",
            component:
              !isStreaming && hasActiveFilters ? (
                <Chip
                  label={t("library.filters.reset")}
                  icon={<Feather name='x' size={13} color='white' />}
                  onPress={resetCollectionFilters}
                />
              ) : null,
          },
          {
            key: "genre",
            component: !isStreaming ? (
              <FilterButton
                className='mr-1'
                id={collectionId}
                queryKey='genreFilter'
                options={availableFilters?.Genres ?? []}
                set={setSelectedGenres}
                values={selectedGenres}
                title={t("library.filters.genres")}
                renderItemLabel={(item) => item.toString()}
              />
            ) : null,
          },
          {
            key: "year",
            component: !isStreaming ? (
              <FilterButton
                className='mr-1'
                id={collectionId}
                queryKey='yearFilter'
                options={availableFilters?.Years ?? []}
                set={setSelectedYears}
                values={selectedYears}
                title={t("library.filters.years")}
                renderItemLabel={(item) => item.toString()}
              />
            ) : null,
          },
          {
            key: "tags",
            component: !isStreaming ? (
              <FilterButton
                className='mr-1'
                id={collectionId}
                queryKey='tagsFilter'
                options={availableFilters?.Tags ?? []}
                set={setSelectedTags}
                values={selectedTags}
                title={t("library.filters.tags")}
                renderItemLabel={(item) => item.toString()}
              />
            ) : null,
          },
          {
            key: "sortBy",
            component: (
              <FilterButton
                className='mr-1'
                id={collectionId}
                queryKey='sortBy'
                options={
                  isStreaming
                    ? [
                        SortByOption.SortName,
                        SortByOption.DateCreated,
                        SortByOption.PremiereDate,
                      ]
                    : sortOptions.map((s) => s.key)
                }
                set={(value) => {
                  setSortBy(value);
                  // Choosing a sort leaves the quick lists, as on the TV
                  setQuickList("NEW");
                }}
                values={sortBy}
                title={t("library.filters.sort_by")}
                renderItemLabel={(item) =>
                  isStreaming && item === SortByOption.PremiereDate
                    ? t("library.filters.release_date")
                    : sortOptions.find((i) => i.key === item)?.value || ""
                }
              />
            ),
          },
          {
            key: "sortOrder",
            component: (
              <FilterButton
                className='mr-1'
                id={collectionId}
                queryKey='sortOrder'
                queryFn={async () => sortOrderOptions.map((s) => s.key)}
                set={setSortOrder}
                values={sortOrder}
                title={t("library.filters.sort_order")}
                renderItemLabel={(item) =>
                  isStreaming && sortBy[0] !== SortByOption.SortName
                    ? t(
                        item === SortOrderOption.Descending
                          ? "library.filters.newest_first"
                          : "library.filters.oldest_first",
                      )
                    : sortOrderOptions.find((i) => i.key === item)?.value || ""
                }
              />
            ),
          },
        ]}
        renderItem={({ item }) => item.component}
        keyExtractor={(item) => item.key}
      />
    ),
    [
      collectionId,
      availableFilters,
      hasActiveFilters,
      resetCollectionFilters,
      api,
      user?.Id,
      selectedGenres,
      setSelectedGenres,
      selectedYears,
      setSelectedYears,
      selectedTags,
      setSelectedTags,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      isStreaming,
      showAlphabet,
      accent,
      t,
    ],
  );

  // TV Filter options - with "All" option for clearable filters
  const tvGenreFilterOptions = useMemo(
    (): TVOptionItem<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: selectedGenres.length === 0,
      },
      ...(tvGenreOptions || []).map((genre) => ({
        label: genre,
        value: genre,
        selected: selectedGenres.includes(genre),
      })),
    ],
    [tvGenreOptions, selectedGenres, t],
  );

  const tvYearFilterOptions = useMemo(
    (): TVOptionItem<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: selectedYears.length === 0,
      },
      ...(tvYearOptions || []).map((year) => ({
        label: String(year),
        value: String(year),
        selected: selectedYears.includes(String(year)),
      })),
    ],
    [tvYearOptions, selectedYears, t],
  );

  const tvTagFilterOptions = useMemo(
    (): TVOptionItem<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: selectedTags.length === 0,
      },
      ...(tvTagOptions || []).map((tag) => ({
        label: tag,
        value: tag,
        selected: selectedTags.includes(tag),
      })),
    ],
    [tvTagOptions, selectedTags, t],
  );

  const tvSortByOptions = useMemo(
    (): TVOptionItem<SortByOption>[] =>
      sortOptions.map((option) => ({
        label: option.value,
        value: option.key,
        selected: sortBy[0] === option.key,
      })),
    [sortBy],
  );

  const tvSortOrderOptions = useMemo(
    (): TVOptionItem<SortOrderOption>[] =>
      sortOrderOptions.map((option) => ({
        label: option.value,
        value: option.key,
        selected: sortOrder[0] === option.key,
      })),
    [sortOrder],
  );

  // TV Filter handlers using navigation-based modal
  const handleShowGenreFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.genres"),
      options: tvGenreFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setSelectedGenres([]);
        } else if (selectedGenres.includes(value)) {
          setSelectedGenres(selectedGenres.filter((g) => g !== value));
        } else {
          setSelectedGenres([...selectedGenres, value]);
        }
      },
    });
  }, [showOptions, t, tvGenreFilterOptions, selectedGenres, setSelectedGenres]);

  const handleShowYearFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.years"),
      options: tvYearFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setSelectedYears([]);
        } else if (selectedYears.includes(value)) {
          setSelectedYears(selectedYears.filter((y) => y !== value));
        } else {
          setSelectedYears([...selectedYears, value]);
        }
      },
    });
  }, [showOptions, t, tvYearFilterOptions, selectedYears, setSelectedYears]);

  const handleShowTagFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.tags"),
      options: tvTagFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setSelectedTags([]);
        } else if (selectedTags.includes(value)) {
          setSelectedTags(selectedTags.filter((tag) => tag !== value));
        } else {
          setSelectedTags([...selectedTags, value]);
        }
      },
    });
  }, [showOptions, t, tvTagFilterOptions, selectedTags, setSelectedTags]);

  const handleShowSortByFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.sort_by"),
      options: tvSortByOptions,
      onSelect: (value: SortByOption) => {
        setSortBy([value]);
      },
    });
  }, [showOptions, t, tvSortByOptions, setSortBy]);

  const handleShowSortOrderFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.sort_order"),
      options: tvSortOrderOptions,
      onSelect: (value: SortOrderOption) => {
        setSortOrder([value]);
      },
    });
  }, [showOptions, t, tvSortOrderOptions, setSortOrder]);

  const resetAllFilters = resetCollectionFilters;

  // Phones draw the page's head as soon as the collection is known and show
  // loading, failure and retry for its titles in the list area below it.
  const itemsFailed = !ranked && itemsError && flatData.length === 0;
  const itemsPending = !ranked && !data && !itemsError;

  if (
    Platform.isTV
      ? collectionError || itemsFailed
      : collectionError && !collection
  ) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          gap: 12,
        }}
      >
        <Text>{t("home.section_failed")}</Text>
        <Button
          variant='border'
          loading={fetchingCollection || isFetching}
          onPress={() => {
            if (collectionError) void refetchCollection();
            else void refetch();
          }}
        >
          {t("home.retry")}
        </Button>
      </View>
    );
  }

  if (isCollectionLoading || (Platform.isTV && isLoading)) {
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );
  }

  if (!collection) return null;

  // Mobile return
  if (!Platform.isTV) {
    return (
      <View style={{ flex: 1 }}>
        <FlashList
          // A fresh grid per list and filter, opening at the top. FlashList
          // keeps the first visible title in place when its data changes
          // (which keeps the place when earlier pages load), so switching
          // POPULAR to TRENDING jumped down to wherever that title is in the
          // new list, taking the buttons off screen (owner, 2026-10-17).
          key={`${filterSignature}:${ranked ? quickList : "NEW"}`}
          ref={flashListRef}
          ListEmptyComponent={
            itemsFailed ? (
              <View style={{ paddingTop: 40, paddingHorizontal: 24, gap: 12 }}>
                <Text>{t("home.section_failed")}</Text>
                <Button
                  variant='border'
                  loading={fetchingCollection || isFetching}
                  onPress={() => {
                    if (collectionError) void refetchCollection();
                    void refetch();
                  }}
                >
                  {t("home.retry")}
                </Button>
              </View>
            ) : itemsPending || (ranked && rankedFetching) ? (
              <View style={{ paddingTop: 40, alignItems: "center" }}>
                <Loader />
              </View>
            ) : (
              <View className='flex flex-col items-center justify-center h-full'>
                <Text className='font-bold text-xl text-neutral-500'>
                  {t("search.no_results")}
                </Text>
              </View>
            )
          }
          contentInsetAdjustmentBehavior='automatic'
          data={listData}
          getItemType={gridItemType}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={renderItem}
          keyExtractor={gridKeyExtractor}
          numColumns={nrOfCols}
          onLoad={scrollToPendingLetter}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScroll={({ nativeEvent }) => {
            const offset = nativeEvent.contentOffset.y;
            const movingUp = offset < scrollOffsetRef.current;
            scrollOffsetRef.current = offset;
            setRailTop(Math.max(0, headerHeight - offset) + 8);
            if (
              movingUp &&
              offset < 160 &&
              hasPreviousPage &&
              !isFetching &&
              !pendingJumpRef.current
            ) {
              void fetchPreviousPage({ cancelRefetch: false });
            }
          }}
          scrollEventThrottle={64}
          showsVerticalScrollIndicator={!showAlphabet}
          onEndReached={() => {
            if (hasNextPage && !isFetching) {
              void fetchNextPage({ cancelRefetch: false });
            }
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View
              onLayout={(event) =>
                setHeaderHeight(event.nativeEvent.layout.height)
              }
            >
              {/* The logo header only for services with a bundled wordmark */}
              {isStreaming && service?.wordmark && service.brand ? (
                <StreamingServiceHeader
                  collection={collection}
                  wordmark={service.wordmark}
                  brand={service.brand}
                />
              ) : null}
              <TypeButtonRow
                value={mediaType}
                onChange={setMediaType}
                onRandom={openRandom}
                randomBusy={randomBusy}
              />
              {/* Ranked lists only for services the server keeps JustWatch
                  lists for; any other streaming collection stays on NEW */}
              {isStreaming && listCode ? (
                <QuickListRow
                  value={quickList}
                  accent={accent}
                  // Tapping the selected list again goes back to NEW
                  onChange={(list) =>
                    setQuickList((current) => (current === list ? "NEW" : list))
                  }
                />
              ) : null}
              {listHeader}
            </View>
          }
          contentContainerStyle={{
            paddingBottom: 24,
            paddingRight: nameSorted ? ALPHABET_RAIL_WIDTH : 0,
          }}
          ItemSeparatorComponent={() => (
            <View
              style={{
                width: 10,
                height: 10,
              }}
            />
          )}
        />
        {showAlphabet && (
          <LibraryAlphabetPicker
            accent={accent ?? NeonBoard.volt}
            activeLetter={activeLetter}
            availableLetters={availableLetters}
            descending={sortOrder[0] === SortOrderOption.Descending}
            top={railTop}
            loading={isAlphabetFetching && !alphabet}
            failed={alphabetError}
            pickerOpen={pickerOpen}
            onOpen={() => setPickerOpen(true)}
            onClose={() => setPickerOpen(false)}
            onRetry={() => void refetchAlphabet()}
            onSelect={jumpToLetter}
          />
        )}
      </View>
    );
  }

  // TV return with filter bar
  return (
    <View style={{ flex: 1 }}>
      {/* Filter bar */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "nowrap",
          marginTop: insets.top + 100,
          paddingBottom: 8,
          paddingHorizontal: TV_SCALE_PADDING,
          gap: 12,
        }}
      >
        {hasActiveFilters && (
          <TVFilterButton
            label=''
            value={t("library.filters.reset")}
            onPress={resetAllFilters}
            hasActiveFilter
          />
        )}
        <TVFilterButton
          label={t("library.filters.genres")}
          value={
            selectedGenres.length > 0
              ? `${selectedGenres.length} selected`
              : t("library.filters.all")
          }
          onPress={handleShowGenreFilter}
          hasTVPreferredFocus={!hasActiveFilters}
          hasActiveFilter={selectedGenres.length > 0}
        />
        <TVFilterButton
          label={t("library.filters.years")}
          value={
            selectedYears.length > 0
              ? `${selectedYears.length} selected`
              : t("library.filters.all")
          }
          onPress={handleShowYearFilter}
          hasActiveFilter={selectedYears.length > 0}
        />
        <TVFilterButton
          label={t("library.filters.tags")}
          value={
            selectedTags.length > 0
              ? `${selectedTags.length} selected`
              : t("library.filters.all")
          }
          onPress={handleShowTagFilter}
          hasActiveFilter={selectedTags.length > 0}
        />
        <TVFilterButton
          label={t("library.filters.sort_by")}
          value={sortOptions.find((o) => o.key === sortBy[0])?.value || ""}
          onPress={handleShowSortByFilter}
        />
        <TVFilterButton
          label={t("library.filters.sort_order")}
          value={
            sortOrderOptions.find((o) => o.key === sortOrder[0])?.value || ""
          }
          onPress={handleShowSortOrderFilter}
        />
      </View>

      {/* Grid */}
      <FlatList
        key={`${orientation}-${nrOfCols}`}
        ListEmptyComponent={
          <View className='flex flex-col items-center justify-center h-full'>
            <Text className='font-bold text-xl text-neutral-500'>
              {t("search.no_results")}
            </Text>
          </View>
        }
        contentInsetAdjustmentBehavior='automatic'
        data={flatData}
        renderItem={renderTVItem}
        extraData={[orientation, nrOfCols]}
        keyExtractor={keyExtractor}
        numColumns={nrOfCols}
        removeClippedSubviews={false}
        onEndReached={() => {
          if (hasNextPage && !isFetching) {
            void fetchNextPage({ cancelRefetch: false });
          }
        }}
        onEndReachedThreshold={1}
        contentContainerStyle={{
          paddingBottom: 24,
          paddingLeft: TV_SCALE_PADDING,
          paddingRight: TV_SCALE_PADDING,
          paddingTop: 20,
        }}
        ItemSeparatorComponent={() => (
          <View
            style={{
              width: 10,
              height: 10,
            }}
          />
        )}
      />
    </View>
  );
};

export default page;
