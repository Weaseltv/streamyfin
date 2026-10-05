import type { ItemsApiGetItemsRequest } from "@jellyfin/sdk/lib/generated-client/api/items-api";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getFilterApi,
  getItemsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  BackHandler,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import { FilterButton } from "@/components/filters/FilterButton";
import { ResetFiltersButton } from "@/components/filters/ResetFiltersButton";
import { ItemCardText } from "@/components/ItemCardText";
import { Loader } from "@/components/Loader";
import { LibraryAlphabetPicker } from "@/components/library/LibraryAlphabetPicker";
import { ItemPoster } from "@/components/posters/ItemPoster";
import { SearchField } from "@/components/search/SearchField";
import { TVFilterButton, TVFocusablePoster } from "@/components/tv";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { libraryAccent, NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { Freshness } from "@/constants/queryFreshness";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useAvailableItemFilters } from "@/hooks/useAvailableItemFilters";
import { useFilterReset } from "@/hooks/useFilterReset";
import { useOrientation } from "@/hooks/useOrientation";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  FilterByOption,
  FilterByPreferenceAtom,
  filterByAtom,
  genreFilterAtom,
  genrePreferenceAtom,
  getFilterByPreference,
  getMultiFilterPreference,
  getSortByPreference,
  getSortOrderPreference,
  SortByOption,
  SortOrderOption,
  sortByAtom,
  sortByPreferenceAtom,
  sortOptions,
  sortOrderAtom,
  sortOrderOptions,
  sortOrderPreferenceAtom,
  tagPreferenceAtom,
  tagsFilterAtom,
  useFilterOptions,
  yearFilterAtom,
  yearPreferenceAtom,
} from "@/utils/atoms/filters";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import {
  ALPHABET_RAIL_WIDTH,
  getLibraryLetter,
  getNextLibraryPage,
  getPreviousLibraryPage,
  loadLibraryAlphabet,
} from "@/utils/libraryAlphabet";

const GRID_GAP = 10;
const GridSeparator = () => (
  <View style={{ width: GRID_GAP, height: GRID_GAP }} />
);

const TV_ITEM_GAP = 20;
const TV_HORIZONTAL_PADDING = 60;
const _TV_SCALE_PADDING = 20;
const TV_PLAYLIST_SQUARE_SIZE = 180;

const Page = () => {
  const searchParams = useLocalSearchParams() as {
    libraryId: string;
    sortBy?: string;
    sortOrder?: string;
    filterBy?: string;
    fromSeeAll?: string;
  };
  const { libraryId, fromSeeAll } = searchParams;

  const typography = useScaledTVTypography();
  const posterSizes = useScaledTVPosterSizes();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { width: screenWidth } = useWindowDimensions();

  const [selectedGenres, setSelectedGenres] = useAtom(genreFilterAtom);
  const [selectedYears, setSelectedYears] = useAtom(yearFilterAtom);
  const [selectedTags, setSelectedTags] = useAtom(tagsFilterAtom);
  const [sortBy, _setSortBy] = useAtom(sortByAtom);
  const [filterBy, _setFilterBy] = useAtom(filterByAtom);
  const [sortOrder, _setSortOrder] = useAtom(sortOrderAtom);
  const [sortByPreference, setSortByPreference] = useAtom(sortByPreferenceAtom);
  const [filterByPreference, setFilterByPreference] = useAtom(
    FilterByPreferenceAtom,
  );
  const [sortOrderPreference, setOrderByPreference] = useAtom(
    sortOrderPreferenceAtom,
  );
  const [genrePreference, setGenrePreference] = useAtom(genrePreferenceAtom);
  const [yearPreference, setYearPreference] = useAtom(yearPreferenceAtom);
  const [tagPreference, setTagPreference] = useAtom(tagPreferenceAtom);

  const { orientation } = useOrientation();
  const insets = useSafeAreaInsets();

  // Title search inside this library (phone). The fetch runs on the
  // debounced `searchTerm`, not on every keystroke.
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchTerm("");
      return;
    }
    const handle = setTimeout(() => setSearchTerm(trimmed), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // True only while this screen is focused AND its filters have been restored
  // into the shared atoms. The atoms are global, so while this screen sits
  // hidden in the stack a sibling library rewrites them; without this gate
  // the hidden screen refetched its items with the sibling's filters, and on
  // refocus fired one more request with the stale filters before the restore
  // below ran.
  const [filtersReady, setFiltersReady] = useState(false);
  const nameSorted = !Platform.isTV && sortBy[0] === SortByOption.SortName;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeLetter, setActiveLetter] = useState<string>();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [railTop, setRailTop] = useState(0);
  const scrollOffsetRef = useRef(0);
  const pendingJumpRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    setRailTop(Math.max(0, headerHeight - scrollOffsetRef.current) + 8);
  }, [headerHeight]);

  // Key navigation by the complete result set. A new filter must never use an
  // offset from the previous library, search, sort, or column arrangement.
  const filterSignature = JSON.stringify([
    api?.basePath,
    user?.Id,
    libraryId,
    selectedGenres,
    selectedYears,
    selectedTags,
    sortBy,
    sortOrder,
    filterBy,
    searchTerm,
  ]);
  const [jump, setJump] = useState<{ signature: string; startIndex: number }>();
  const jumpStart =
    nameSorted && jump?.signature === filterSignature ? jump.startIndex : 0;

  const { t } = useTranslation();
  const router = useRouter();
  const { showOptions } = useTVOptionModal();

  // When this library detail was opened from the home "See All" button, its
  // libraries stack is just [detail], so the default TV Back would exit to home.
  // Intercept Back (scoped to while this screen is focused via useFocusEffect) and
  // route to the library list instead, so the user can switch libraries. Normal
  // entries from the list keep their native pop-to-list behavior.
  useFocusEffect(
    useCallback(() => {
      if (!Platform.isTV || fromSeeAll !== "true") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        router.replace("/(auth)/(tabs)/(libraries)");
        return true;
      });
      return () => sub.remove();
    }, [fromSeeAll, router]),
  );
  const { showItemActions } = useTVItemActionModal();

  // TV Filter queries
  const { data: tvGenreOptions } = useQuery({
    queryKey: ["filters", "Genres", "tvGenreFilter", libraryId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: libraryId,
      });
      return response.data.Genres || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!libraryId,
  });

  const { data: tvYearOptions } = useQuery({
    queryKey: ["filters", "Years", "tvYearFilter", libraryId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: libraryId,
      });
      return response.data.Years || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!libraryId,
  });

  const { data: tvTagOptions } = useQuery({
    queryKey: ["filters", "Tags", "tvTagFilter", libraryId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: libraryId,
      });
      return response.data.Tags || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!libraryId,
  });

  // The "See All" params describe how to open the screen, not a state to hold:
  // once applied, a reset (or any later run of this effect) has to be free to
  // move away from them, so they only win on the run that first sees them.
  const appliedUrlParamsRef = useRef<string | null>(null);

  // What this screen was showing when it lost focus. The atoms are shared, so
  // a sibling library rewrites them while this one is hidden; on return the
  // screen restores exactly its own previous state instead of re-deriving it.
  // Re-deriving used saved preferences only, so a library opened from Home's
  // "See all" (newest first) came back sorted A-Z and refetched.
  const currentFiltersRef = useRef({
    sortBy,
    sortOrder,
    filterBy,
    selectedGenres,
    selectedYears,
    selectedTags,
  });
  currentFiltersRef.current = {
    sortBy,
    sortOrder,
    filterBy,
    selectedGenres,
    selectedYears,
    selectedTags,
  };
  const blurSnapshotRef = useRef<typeof currentFiltersRef.current | null>(null);
  const focusNavigation = useNavigation();
  useEffect(
    () =>
      focusNavigation.addListener("blur", () => {
        blurSnapshotRef.current = currentFiltersRef.current;
      }),
    [focusNavigation],
  );

  // Restoring on focus rather than on mount: every filter atom is global and
  // shared by all library screens, so a sibling library that mounts on top
  // overwrites them. The stack keeps this screen mounted, so a mount effect
  // never runs again and the wrong library's filters stay applied.
  useFocusEffect(
    useCallback(() => {
      // Returning to this screen: put back what it was showing. Consumed once,
      // so later runs of this effect (preference changes while focused, a
      // reset) take the normal path below.
      const snapshot = blurSnapshotRef.current;
      if (snapshot) {
        blurSnapshotRef.current = null;
        _setSortBy(snapshot.sortBy);
        _setSortOrder(snapshot.sortOrder);
        _setFilterBy(snapshot.filterBy);
        setSelectedGenres(snapshot.selectedGenres);
        setSelectedYears(snapshot.selectedYears);
        setSelectedTags(snapshot.selectedTags);
        setFiltersReady(true);
        return () => setFiltersReady(false);
      }

      const urlParamsKey = `${searchParams.sortBy ?? ""}|${
        searchParams.sortOrder ?? ""
      }|${searchParams.filterBy ?? ""}`;
      const urlParamsAreNew = appliedUrlParamsRef.current !== urlParamsKey;
      appliedUrlParamsRef.current = urlParamsKey;

      const urlSortBy = urlParamsAreNew
        ? (searchParams.sortBy as SortByOption | undefined)
        : undefined;
      const urlSortOrder = urlParamsAreNew
        ? (searchParams.sortOrder as SortOrderOption | undefined)
        : undefined;
      const urlFilterBy = urlParamsAreNew
        ? (searchParams.filterBy as FilterByOption | undefined)
        : undefined;

      // Apply sortOrder: URL param > saved preference > default
      if (
        urlSortOrder &&
        Object.values(SortOrderOption).includes(urlSortOrder)
      ) {
        _setSortOrder([urlSortOrder]);
      } else {
        const sop = getSortOrderPreference(libraryId, sortOrderPreference);
        _setSortOrder([sop || SortOrderOption.Ascending]);
      }

      // Apply sortBy: URL param > saved preference > default
      if (urlSortBy && Object.values(SortByOption).includes(urlSortBy)) {
        _setSortBy([urlSortBy]);
      } else {
        const obp = getSortByPreference(libraryId, sortByPreference);
        _setSortBy([obp || SortByOption.SortName]);
      }

      // Apply filterBy: URL param > saved preference > default
      if (urlFilterBy && Object.values(FilterByOption).includes(urlFilterBy)) {
        _setFilterBy([urlFilterBy]);
      } else {
        const fp = getFilterByPreference(libraryId, filterByPreference);
        _setFilterBy(fp ? [fp] : []);
      }

      // Genres / years / tags have no URL params, only the per-library memory.
      setSelectedGenres(getMultiFilterPreference(libraryId, genrePreference));
      setSelectedYears(getMultiFilterPreference(libraryId, yearPreference));
      setSelectedTags(getMultiFilterPreference(libraryId, tagPreference));
      setFiltersReady(true);
      return () => setFiltersReady(false);
    }, [
      libraryId,
      sortOrderPreference,
      sortByPreference,
      _setSortOrder,
      _setSortBy,
      filterByPreference,
      _setFilterBy,
      genrePreference,
      yearPreference,
      tagPreference,
      setSelectedGenres,
      setSelectedYears,
      setSelectedTags,
      searchParams.sortBy,
      searchParams.sortOrder,
      searchParams.filterBy,
    ]),
  );

  const setSortBy = useCallback(
    (sortBy: SortByOption[]) => {
      const sop = getSortByPreference(libraryId, sortByPreference);
      if (sortBy[0] !== sop) {
        setSortByPreference({ ...sortByPreference, [libraryId]: sortBy[0] });
      }
      _setSortBy(sortBy);
    },
    [libraryId, sortByPreference, setSortByPreference, _setSortBy],
  );

  const setSortOrder = useCallback(
    (sortOrder: SortOrderOption[]) => {
      const sop = getSortOrderPreference(libraryId, sortOrderPreference);
      if (sortOrder[0] !== sop) {
        setOrderByPreference({
          ...sortOrderPreference,
          [libraryId]: sortOrder[0],
        });
      }
      _setSortOrder(sortOrder);
    },
    [libraryId, sortOrderPreference, setOrderByPreference, _setSortOrder],
  );

  const setFilter = useCallback(
    (filterBy: FilterByOption[]) => {
      const fp = getFilterByPreference(libraryId, filterByPreference);
      if (filterBy[0] !== fp) {
        setFilterByPreference({
          ...filterByPreference,
          [libraryId]: filterBy[0],
        });
      }
      _setFilterBy(filterBy);
    },
    [libraryId, filterByPreference, setFilterByPreference, _setFilterBy],
  );

  // Genres / years / tags: save the per-library memory then update the active
  // atom (mirrors setSortBy, and avoids a save-effect that would write the
  // outgoing library's selection onto the incoming one).
  const setGenres = useCallback(
    (genres: string[]) => {
      setGenrePreference({ ...genrePreference, [libraryId]: genres });
      setSelectedGenres(genres);
    },
    [libraryId, genrePreference, setGenrePreference, setSelectedGenres],
  );

  const setYears = useCallback(
    (years: string[]) => {
      setYearPreference({ ...yearPreference, [libraryId]: years });
      setSelectedYears(years);
    },
    [libraryId, yearPreference, setYearPreference, setSelectedYears],
  );

  const setTags = useCallback(
    (tags: string[]) => {
      setTagPreference({ ...tagPreference, [libraryId]: tags });
      setSelectedTags(tags);
    },
    [libraryId, tagPreference, setTagPreference, setSelectedTags],
  );

  const nrOfCols = useMemo(() => {
    if (Platform.isTV) {
      // TV uses flexWrap, so nrOfCols is just for mobile
      return 1;
    }
    // Keep three columns on typical phones. Name-sorted grids reserve a
    // narrow gutter for the alphabet without letting it cover the posters.
    return Math.max(
      2,
      Math.floor(
        (screenWidth - Sizes.gutter * 2 + GRID_GAP) / (100 + GRID_GAP),
      ),
    );
  }, [screenWidth, orientation]);

  const cardWidth = useMemo(
    () =>
      Math.floor(
        (screenWidth -
          insets.left -
          insets.right -
          Sizes.gutter * 2 -
          (nameSorted ? ALPHABET_RAIL_WIDTH : 0) -
          GRID_GAP * (nrOfCols - 1)) /
          nrOfCols,
      ),
    [screenWidth, nrOfCols, insets.left, insets.right, nameSorted],
  );
  // Whole rows keep prepended pages aligned, including tablets/landscape.
  const pageSize = Platform.isTV ? 36 : Math.ceil(36 / nrOfCols) * nrOfCols;

  const { data: library, isLoading: isLibraryLoading } = useQuery({
    queryKey: ["library", libraryId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getUserLibraryApi(api).getItem({
        itemId: libraryId,
        userId: user?.Id,
      });
      return response.data;
    },
    enabled: !!api && !!user?.Id && !!libraryId,
    staleTime: 60 * 1000,
  });

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      title: library?.Name || "",
    });
  }, [library]);

  const accent = libraryAccent(library?.CollectionType, library?.Name);
  useSetPageAccent(library ? accent : undefined);

  // If this See-All detail was deep-linked on top of the libraries index, collapse
  // the libraries stack to just this screen. Otherwise the stack is [index, detail],
  // which the native bottom tab reliably auto-pops back to the index (the detail
  // "bounces" to the library list ~0.5s after opening). With [detail] alone it stays
  // put, and Back is handled explicitly by the fromSeeAll interceptor above.
  const didCollapseRef = useRef(false);
  useEffect(() => {
    if (!Platform.isTV || fromSeeAll !== "true" || didCollapseRef.current)
      return;
    const state = navigation.getState();
    if (state?.routes && state.routes.length > 1) {
      didCollapseRef.current = true;
      const top = state.routes[state.routes.length - 1];
      navigation.reset({ index: 0, routes: [top] } as any);
    }
  }, [navigation, fromSeeAll]);

  const itemQuery = useMemo((): ItemsApiGetItemsRequest => {
    let itemType: BaseItemKind | undefined;

    // This fix makes sure to only return 1 type of items, if defined.
    // This is because the underlying directory some times contains other types, and we don't want to show them.
    if (library?.CollectionType === "movies") {
      itemType = "Movie";
    } else if (library?.CollectionType === "tvshows") {
      itemType = "Series";
    } else if (library?.CollectionType === "boxsets") {
      itemType = "BoxSet";
    } else if (library?.CollectionType === "homevideos") {
      itemType = "Video";
    } else if (library?.CollectionType === "musicvideos") {
      itemType = "MusicVideo";
    } else if (library?.CollectionType === "playlists") {
      itemType = "Playlist";
    }

    return {
      userId: user?.Id,
      parentId: libraryId,
      sortBy: [sortBy[0], "SortName", "ProductionYear"],
      sortOrder: [sortOrder[0]],
      enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
      filters: filterBy as ItemFilter[],
      // true is needed for merged versions
      recursive: true,
      imageTypeLimit: 1,
      fields: ["PrimaryImageAspectRatio", "SortName"],
      genres: selectedGenres,
      tags: selectedTags,
      years: selectedYears.map((year) => Number.parseInt(year, 10)),
      includeItemTypes: itemType ? [itemType] : undefined,
      searchTerm: searchTerm || undefined,
      ...(Platform.isTV && library?.CollectionType === "playlists"
        ? { mediaTypes: ["Video"] }
        : {}),
    };
  }, [
    api,
    user?.Id,
    libraryId,
    library,
    selectedGenres,
    selectedYears,
    selectedTags,
    sortBy,
    sortOrder,
    filterBy,
    searchTerm,
  ]);

  const fetchItems = useCallback(
    async ({
      pageParam,
      signal,
    }: {
      pageParam: number;
      signal?: AbortSignal;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!api || !library) return null;
      const response = await getItemsApi(api).getItems(
        { ...itemQuery, limit: pageSize, startIndex: pageParam },
        { signal },
      );
      return response.data || null;
    },
    [api, library, itemQuery, pageSize],
  );

  const { data: availableFilters } = useAvailableItemFilters(
    libraryId,
    !Platform.isTV,
  );

  const {
    data,
    isFetching,
    fetchNextPage,
    hasNextPage,
    fetchPreviousPage,
    hasPreviousPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      "library-items",
      libraryId,
      selectedGenres,
      selectedYears,
      selectedTags,
      sortBy,
      sortOrder,
      filterBy,
      searchTerm,
      jumpStart,
      pageSize,
    ],
    queryFn: fetchItems,
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      getNextLibraryPage(lastPage, lastPageParam),
    getPreviousPageParam: (_firstPage, _pages, firstPageParam) =>
      getPreviousLibraryPage(firstPageParam, pageSize),
    initialPageParam: jumpStart,
    // Re-enabling after filter restoration fetches only stale/invalidated
    // data; a second focus invalidation would replay every loaded page.
    // Playback/favorite filters and sorts still refresh on every return.
    staleTime:
      filterBy.length > 0 ||
      sortBy.some((value) =>
        [
          SortByOption.DatePlayed,
          SortByOption.PlayCount,
          SortByOption.Random,
        ].includes(value),
      )
        ? 0
        : Freshness.catalog,
    enabled: !!api && !!user?.Id && !!library && filtersReady,
  });

  const flatData = useMemo(() => {
    return (
      (data?.pages.flatMap((p) => p?.Items).filter(Boolean) as BaseItemDto[]) ||
      []
    );
  }, [data]);

  const flashListRef = useRef<FlashListRef<BaseItemDto>>(null);

  const {
    data: alphabet,
    isFetching: isAlphabetFetching,
    isError: isAlphabetError,
    refetch: refetchAlphabet,
  } = useQuery({
    queryKey: ["library-items", libraryId, "alphabet", filterSignature],
    queryFn: async ({ signal }) => {
      if (!api) throw new Error("No library server available");
      return loadLibraryAlphabet(async (startIndex, limit) => {
        const response = await getItemsApi(api).getItems(
          {
            ...itemQuery,
            startIndex,
            limit,
            enableImages: false,
            enableUserData: false,
            fields: ["SortName"],
          },
          { signal },
        );
        return response.data;
      }, signal);
    },
    enabled: nameSorted && !!api && !!user?.Id && !!library && filtersReady,
    staleTime: filterBy.length > 0 ? 0 : 5 * Freshness.catalog,
  });
  const availableLetters = useMemo(
    () => alphabet?.entries.map((entry) => entry.letter) ?? [],
    [alphabet],
  );
  const totalCount = data?.pages?.[0]?.TotalRecordCount ?? alphabet?.totalCount;
  const showAlphabet = nameSorted && (totalCount ?? 0) > pageSize;

  const scrollToPendingLetter = useCallback(() => {
    const id = pendingJumpRef.current;
    if (!id || isFetching) return;
    const index = flatData.findIndex((item) => item.Id === id);
    if (index < 0) {
      // A title may have moved or been removed after the index was cached.
      // Recover to the library start and rebuild instead of leaving a pending
      // jump that would suppress scrolling/viewability indefinitely.
      if (data?.pages.length && !isError) {
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
  }, [flatData, isFetching, data, isError, refetchAlphabet]);

  const jumpToLetter = useCallback(
    (letter: string) => {
      const entry = alphabet?.entries.find((entry) => entry.letter === letter);
      if (!entry) return;
      Keyboard.dismiss();
      pendingScrollTopRef.current = false;
      pendingJumpRef.current = entry.itemId;
      setActiveLetter(letter);
      const loadedIndex = flatData.findIndex(
        (item) => item.Id === entry.itemId,
      );
      if (loadedIndex >= 0 && flashListRef.current) {
        pendingJumpRef.current = undefined;
        void flashListRef.current.scrollToIndex({
          index: loadedIndex,
          animated: false,
          viewPosition: 0,
        });
        return;
      }
      setJump({
        signature: filterSignature,
        startIndex: Math.floor(entry.index / pageSize) * pageSize,
      });
    },
    [alphabet, flatData, filterSignature, pageSize],
  );

  useEffect(scrollToPendingLetter, [scrollToPendingLetter]);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<BaseItemDto>[] }) => {
      if (pendingJumpRef.current) return;
      const first = viewableItems.find((entry) => entry.isViewable);
      if (first) setActiveLetter(getLibraryLetter(first.item));
    },
    [],
  );
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;

  // Jump the grid back to the top when the filters or the sort change, reset
  // included, instead of staying deep in the previous result set.
  const pendingScrollTopRef = useRef(false);
  const resetSignatureRef = useRef("");

  // Instant feedback: pin to the top as soon as the filters change, without
  // waiting for the new fetch, and flag a re-pin for once it settles.
  useEffect(() => {
    if (!filtersReady) return;
    const signature = `${filterSignature}|${pageSize}`;
    if (resetSignatureRef.current === signature) return;
    resetSignatureRef.current = signature;
    setJump(undefined);
    setPickerOpen(false);
    setActiveLetter(undefined);
    pendingJumpRef.current = undefined;
    flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    pendingScrollTopRef.current = true;
  }, [filterSignature, pageSize, filtersReady]);

  // Safety net: FlashList can restore the previous offset as the filtered list
  // grows, so re-pin once the fetch settles. Pagination keeps the same
  // signature, so it never re-pins.
  useEffect(() => {
    if (pendingScrollTopRef.current && !isFetching) {
      pendingScrollTopRef.current = false;
      flashListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [isFetching, flatData]);

  // A typed library does not repeat its type on every card.
  const typedLibrary =
    library?.CollectionType === "movies" ||
    library?.CollectionType === "tvshows";

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => (
      <TouchableItemRouter
        style={{
          width: "100%",
          marginBottom: 6,
          alignItems:
            index % nrOfCols === 0
              ? "flex-start"
              : (index + 1) % nrOfCols === 0
                ? "flex-end"
                : "center",
        }}
        item={item}
      >
        <View style={{ width: cardWidth }}>
          <ItemPoster
            item={item}
            width={cardWidth}
            badge={typedLibrary ? null : undefined}
          />
          <ItemCardText item={item} />
        </View>
      </TouchableItemRouter>
    ),
    [nrOfCols, cardWidth, typedLibrary],
  );

  const renderTVItem = useCallback(
    (item: BaseItemDto) => {
      const handlePress = () => {
        if (item.Type === "Playlist") {
          router.push({
            pathname: "/(auth)/(tabs)/(libraries)/[libraryId]",
            params: { libraryId: item.Id! },
          });
          return;
        }
        const navTarget = getItemNavigation(item, "(libraries)");
        router.push(navTarget as any);
      };

      // Special rendering for Playlist items (square thumbnails)
      if (item.Type === "Playlist") {
        const playlistImageUrl = getPrimaryImageUrl({
          api,
          item,
          width: TV_PLAYLIST_SQUARE_SIZE * 2,
        });

        return (
          <View
            key={item.Id}
            style={{
              width: TV_PLAYLIST_SQUARE_SIZE,
              alignItems: "center",
            }}
          >
            <TVFocusablePoster
              onPress={handlePress}
              onLongPress={() => showItemActions(item)}
            >
              <View
                style={{
                  width: TV_PLAYLIST_SQUARE_SIZE,
                  aspectRatio: 1,
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: "#1a1a1a",
                }}
              >
                <Image
                  source={playlistImageUrl ? { uri: playlistImageUrl } : null}
                  style={{ width: "100%", height: "100%" }}
                  contentFit='cover'
                  cachePolicy='memory-disk'
                />
              </View>
            </TVFocusablePoster>
            <View style={{ marginTop: 12, alignItems: "center" }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typography.callout,
                  color: "#FFFFFF",
                  textAlign: "center",
                }}
              >
                {item.Name}
              </Text>
            </View>
          </View>
        );
      }

      return (
        <TVPosterCard
          key={item.Id}
          item={item}
          orientation='vertical'
          onPress={handlePress}
          onLongPress={() => showItemActions(item)}
          width={posterSizes.poster}
        />
      );
    },
    [router, showItemActions, api, typography],
  );

  const keyExtractor = useCallback((item: BaseItemDto) => item.Id || "", []);
  const generalFilters = useFilterOptions();
  const libraryTypeLabel =
    library?.CollectionType === "movies"
      ? t("library.item_types.movies")
      : library?.CollectionType === "tvshows"
        ? t("library.item_types.series")
        : library?.CollectionType === "boxsets"
          ? t("library.item_types.boxsets")
          : t("library.item_types.items");
  const sortLabel =
    sortBy[0] === SortByOption.SortName
      ? sortOrder[0] === SortOrderOption.Descending
        ? "Z – A"
        : "A – Z"
      : undefined;

  // An element, not a component: a component recreated on every render would
  // remount the header and drop the search field's focus on each keystroke.
  // The wrapper cancels the list's gutter so the head rule and the search
  // strip run edge to edge.
  const listHeader = useMemo(
    () => (
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{
          marginLeft: -(insets.left + Sizes.gutter),
          marginRight: -(
            insets.right +
            Sizes.gutter +
            (nameSorted ? ALPHABET_RAIL_WIDTH : 0)
          ),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <PageHead
          eyebrow={
            totalCount !== undefined
              ? `${t("tabs.library")} · ${totalCount} ${libraryTypeLabel}`
              : t("tabs.library")
          }
          title={library?.Name ?? ""}
          trailing={sortLabel}
          right={
            showAlphabet ? (
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setPickerOpen(true);
                }}
                accessibilityRole='button'
                accessibilityLabel={t("library.alphabet.title")}
                style={{
                  minHeight: 44,
                  paddingLeft: 12,
                  justifyContent: "center",
                }}
              >
                <Text variant='headTally' accent={accent}>
                  {sortLabel}
                </Text>
              </Pressable>
            ) : undefined
          }
          accent={accent}
          bleedRule
        />
        <SearchField
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={() => setSearchTerm(searchQuery.trim())}
          placeholder={t("library.search_placeholder", {
            name: library?.Name ?? "",
          })}
          accent={accent}
        />
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            display: "flex",
            paddingHorizontal: Sizes.gutter,
            paddingVertical: 12,
            flexDirection: "row",
            gap: 8,
          }}
          data={[
            {
              key: "reset",
              component: <ResetFiltersButton libraryId={libraryId} />,
            },
            {
              key: "genre",
              component: (
                <FilterButton
                  accent={accent}
                  id={libraryId}
                  queryKey='genreFilter'
                  options={availableFilters?.Genres ?? []}
                  set={setGenres}
                  values={selectedGenres}
                  title={t("library.filters.genres")}
                  renderItemLabel={(item) => item.toString()}
                />
              ),
            },
            {
              key: "year",
              component: (
                <FilterButton
                  accent={accent}
                  id={libraryId}
                  queryKey='yearFilter'
                  options={availableFilters?.Years ?? []}
                  set={setYears}
                  values={selectedYears}
                  title={t("library.filters.years")}
                  renderItemLabel={(item) => item.toString()}
                />
              ),
            },
            {
              key: "tags",
              component: (
                <FilterButton
                  accent={accent}
                  id={libraryId}
                  queryKey='tagsFilter'
                  options={availableFilters?.Tags ?? []}
                  set={setTags}
                  values={selectedTags}
                  title={t("library.filters.tags")}
                  renderItemLabel={(item) => item.toString()}
                />
              ),
            },
            {
              key: "sortBy",
              component: (
                <FilterButton
                  accent={accent}
                  showValue
                  id={libraryId}
                  queryKey='sortBy'
                  queryFn={async () => sortOptions.map((s) => s.key)}
                  set={setSortBy}
                  values={sortBy}
                  title={t("library.filters.sort_by")}
                  renderItemLabel={(item) =>
                    sortOptions.find((i) => i.key === item)?.value || ""
                  }
                />
              ),
            },
            {
              key: "sortOrder",
              component: (
                <FilterButton
                  accent={accent}
                  showValue
                  id={libraryId}
                  queryKey='sortOrder'
                  queryFn={async () => sortOrderOptions.map((s) => s.key)}
                  set={setSortOrder}
                  values={sortOrder}
                  title={t("library.filters.sort_order")}
                  renderItemLabel={(item) =>
                    sortOrderOptions.find((i) => i.key === item)?.value || ""
                  }
                />
              ),
            },
            {
              key: "filterOptions",
              component: (
                <FilterButton
                  accent={accent}
                  id={libraryId}
                  queryKey='filters'
                  queryFn={async () => generalFilters.map((s) => s.key)}
                  set={setFilter}
                  values={filterBy}
                  title={t("library.filters.filter_by")}
                  renderItemLabel={(item) =>
                    generalFilters.find((i) => i.key === item)?.value || ""
                  }
                />
              ),
            },
          ]}
          renderItem={({ item }) => item.component}
          keyExtractor={(item) => item.key}
        />
      </View>
    ),
    [
      libraryId,
      api,
      availableFilters,
      user?.Id,
      accent,
      library?.Name,
      totalCount,
      libraryTypeLabel,
      sortLabel,
      nameSorted,
      showAlphabet,
      t,
      insets.left,
      insets.right,
      searchQuery,
      selectedGenres,
      setGenres,
      selectedYears,
      setYears,
      selectedTags,
      setTags,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      filterBy,
      setFilter,
      generalFilters,
    ],
  );

  // Filter bar reset and its visibility, shared with the mobile
  // ResetFiltersButton so sort and order can't be forgotten on one path (they
  // used to be reset on neither).
  const { hasActiveFilters, resetAllFilters } = useFilterReset(libraryId);

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

  const tvFilterByOptions = useMemo(
    (): TVOptionItem<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: filterBy.length === 0,
      },
      ...generalFilters.map((option) => ({
        label: option.value,
        value: option.key,
        selected: filterBy.includes(option.key),
      })),
    ],
    [filterBy, generalFilters, t],
  );

  // TV Filter handlers using navigation-based modal
  const handleShowGenreFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.genres"),
      options: tvGenreFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setGenres([]);
        } else if (selectedGenres.includes(value)) {
          setGenres(selectedGenres.filter((g) => g !== value));
        } else {
          setGenres([...selectedGenres, value]);
        }
      },
    });
  }, [showOptions, t, tvGenreFilterOptions, selectedGenres, setGenres]);

  const handleShowYearFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.years"),
      options: tvYearFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setYears([]);
        } else if (selectedYears.includes(value)) {
          setYears(selectedYears.filter((y) => y !== value));
        } else {
          setYears([...selectedYears, value]);
        }
      },
    });
  }, [showOptions, t, tvYearFilterOptions, selectedYears, setYears]);

  const handleShowTagFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.tags"),
      options: tvTagFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setTags([]);
        } else if (selectedTags.includes(value)) {
          setTags(selectedTags.filter((tag) => tag !== value));
        } else {
          setTags([...selectedTags, value]);
        }
      },
    });
  }, [showOptions, t, tvTagFilterOptions, selectedTags, setTags]);

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

  const handleShowFilterByFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.filter_by"),
      options: tvFilterByOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          _setFilterBy([]);
        } else {
          setFilter([value as FilterByOption]);
        }
      },
    });
  }, [showOptions, t, tvFilterByOptions, setFilter, _setFilterBy]);

  const gridExtraData = useMemo(
    () => [orientation, nrOfCols, cardWidth],
    [orientation, nrOfCols, cardWidth],
  );

  if (Platform.isTV && (isLoading || isLibraryLoading))
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );

  // Mobile return
  if (!Platform.isTV) {
    const busy = isLoading || isLibraryLoading;
    return (
      <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
        <LoadingLine accent={accent} active={busy || isFetching} />
        <FlashList
          ref={flashListRef}
          key={orientation}
          ListEmptyComponent={
            busy ? null : (
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 48,
                }}
              >
                <Text variant='section' muted>
                  {t(
                    isError
                      ? "library.alphabet.load_error"
                      : "library.no_results",
                  )}
                </Text>
                {isError && (
                  <Pressable
                    onPress={() => void refetch()}
                    accessibilityRole='button'
                    style={{ padding: 16 }}
                  >
                    <Text accent={accent}>{t("states.retry")}</Text>
                  </Pressable>
                )}
              </View>
            )
          }
          data={flatData}
          renderItem={renderItem}
          extraData={gridExtraData}
          keyExtractor={keyExtractor}
          numColumns={nrOfCols}
          onLoad={scrollToPendingLetter}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScroll={({ nativeEvent }) => {
            const offset = nativeEvent.contentOffset.y;
            const movingUp = offset < scrollOffsetRef.current;
            scrollOffsetRef.current = offset;
            setRailTop(Math.max(0, headerHeight - offset) + 8);
            // Load earlier pages only after an upward scroll. Mounting a jumped
            // page at the start must not immediately fetch the whole prefix.
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
          onEndReachedThreshold={1}
          ListHeaderComponent={listHeader}
          keyboardShouldPersistTaps='handled'
          keyboardDismissMode='on-drag'
          contentContainerStyle={{
            paddingBottom: 24,
            paddingLeft: insets.left + Sizes.gutter,
            paddingRight:
              insets.right +
              Sizes.gutter +
              (nameSorted ? ALPHABET_RAIL_WIDTH : 0),
          }}
          ItemSeparatorComponent={GridSeparator}
        />
        {showAlphabet && (
          <LibraryAlphabetPicker
            accent={accent}
            activeLetter={activeLetter}
            availableLetters={availableLetters}
            descending={sortOrder[0] === SortOrderOption.Descending}
            top={railTop}
            loading={isAlphabetFetching && !alphabet}
            failed={isAlphabetError}
            pickerOpen={pickerOpen}
            onOpen={() => {
              Keyboard.dismiss();
              setPickerOpen(true);
            }}
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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top + 100,
        paddingBottom: insets.bottom + 60,
        paddingHorizontal: insets.left + TV_HORIZONTAL_PADDING,
      }}
      onScroll={({ nativeEvent }) => {
        // Load more when near bottom
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const isNearBottom =
          layoutMeasurement.height + contentOffset.y >=
          contentSize.height - 500;
        if (isNearBottom && hasNextPage && !isFetching) {
          void fetchNextPage({ cancelRefetch: false });
        }
      }}
      scrollEventThrottle={400}
    >
      {/* Filter bar */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "nowrap",
          justifyContent: "center",
          paddingBottom: 24,
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
        <TVFilterButton
          label={t("library.filters.filter_by")}
          value={
            filterBy.length > 0
              ? generalFilters.find((o) => o.key === filterBy[0])?.value || ""
              : t("library.filters.all")
          }
          onPress={handleShowFilterByFilter}
          hasActiveFilter={filterBy.length > 0}
        />
      </View>

      {/* Grid with flexWrap */}
      {flatData.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 100,
          }}
        >
          <Text style={{ fontSize: typography.body, color: "#737373" }}>
            {t("library.no_results")}
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: TV_ITEM_GAP,
          }}
        >
          {flatData.map((item) => renderTVItem(item))}
        </View>
      )}

      {/* Loading indicator */}
      {isFetching && (
        <View style={{ paddingVertical: 20 }}>
          <Loader />
        </View>
      )}
    </ScrollView>
  );
};

export default React.memo(Page);
