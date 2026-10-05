import { Feather } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
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
import { TVFilterButton } from "@/components/tv";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { NeonBoard, typeAccent } from "@/constants/Colors";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import useRouter from "@/hooks/useAppRouter";
import { useAvailableItemFilters } from "@/hooks/useAvailableItemFilters";
import { useRefreshLibraryOnFocus } from "@/hooks/useRefreshLibraryOnFocus";
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
  ALPHABET_RAIL_WIDTH,
  getLibraryLetter,
  getNextLibraryPage,
  getPreviousLibraryPage,
} from "@/utils/libraryAlphabet";
import {
  loadStreamingCollectionAlphabet,
  loadStreamingCollectionItems,
  STREAMING_COLLECTION_TAG,
  type StreamingMediaType,
} from "@/utils/streamingCollections";

const TV_ITEM_GAP = 16;
const TV_SCALE_PADDING = 20;

const page: React.FC = () => {
  const searchParams = useLocalSearchParams();
  const { collectionId } = searchParams as { collectionId: string };

  const posterSizes = useScaledTVPosterSizes();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
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
  const [sortBy, setSortBy] = useState<SortByOption[]>([
    SortByOption.PremiereDate,
  ]);
  const [sortOrder, setSortOrder] = useState<SortOrderOption[]>([
    SortOrderOption.Ascending,
  ]);

  const {
    data: collection,
    isLoading: isCollectionLoading,
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
    staleTime: 60 * 1000,
  });

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
  const accent = isStreaming
    ? mediaType === "All"
      ? NeonBoard.volt
      : typeAccent({ Type: mediaType })
    : undefined;
  useSetPageAccent(accent, isStreaming);
  const [filterScope, setFilterScope] = useState<string | null>(null);
  useEffect(() => {
    if (!collection || filterScope === collectionId) return;
    setSelectedGenres([]);
    setSelectedYears([]);
    setSelectedTags([]);
    setMediaType("All");
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

  const pageSize = Platform.isTV ? 36 : 18;
  const nameSorted = isStreaming && sortBy[0] === SortByOption.SortName;
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
          limit: pageSize,
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
        // true is needed for merged versions
        recursive: true,
        genres: selectedGenres,
        tags: selectedTags,
        years: selectedYears.map((year) => Number.parseInt(year, 10)),
        includeItemTypes: ["Movie", "Series", "Season"],
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
    isRefetching,
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
    refetchInterval: isStreaming && isFocused ? 60_000 : false,
    enabled:
      !!api && !!user?.Id && !!collection && filterScope === collectionId,
  });

  const collectionKeys = useMemo(
    () => [["collection-items", api?.basePath, user?.Id, collectionId]],
    [api?.basePath, user?.Id, collectionId],
  );
  useRefreshLibraryOnFocus(collectionKeys, 60_000);

  const flatData = useMemo(() => {
    return (
      (data?.pages.flatMap((p) => p?.Items).filter(Boolean) as BaseItemDto[]) ||
      []
    );
  }, [data]);

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
  const showAlphabet =
    nameSorted &&
    (data?.pages[0]?.TotalRecordCount ?? alphabet?.totalCount ?? 0) > pageSize;
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
        setJump({
          signature: filterSignature,
          startIndex: Math.floor(entry.index / pageSize) * pageSize,
        });
      }
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
    ({ item, index }: { item: BaseItemDto; index: number }) => (
      <TouchableItemRouter
        key={item.Id}
        style={{
          width: "100%",
          marginBottom:
            orientation === ScreenOrientation.Orientation.PORTRAIT_UP ? 4 : 16,
        }}
        item={item}
      >
        <View
          style={{
            alignSelf:
              index % 3 === 0
                ? "flex-end"
                : (index + 1) % 3 === 0
                  ? "flex-start"
                  : "center",
            width: "89%",
          }}
        >
          <ItemPoster item={item} />
          <ItemCardText item={item} />
        </View>
      </TouchableItemRouter>
    ),
    [orientation],
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
                set={setSortBy}
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

  if (collectionError || (itemsError && flatData.length === 0)) {
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

  if (isLoading || isCollectionLoading) {
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
          ref={flashListRef}
          ListEmptyComponent={
            <View className='flex flex-col items-center justify-center h-full'>
              <Text className='font-bold text-xl text-neutral-500'>
                {t("search.no_results")}
              </Text>
            </View>
          }
          contentInsetAdjustmentBehavior='automatic'
          data={flatData}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                void refetch();
                if (nameSorted) void refetchAlphabet();
              }}
            />
          }
          renderItem={renderItem}
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
            isStreaming ? (
              <View
                onLayout={(event) =>
                  setHeaderHeight(event.nativeEvent.layout.height)
                }
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    paddingHorizontal: 15,
                    paddingTop: 16,
                  }}
                >
                  {(["All", "Movie", "Series"] as const).map((type) => (
                    <Chip
                      key={type}
                      label={t(
                        type === "All"
                          ? "library.filters.all"
                          : type === "Movie"
                            ? "item_card.movies"
                            : "item_card.shows",
                      )}
                      selected={mediaType === type}
                      accent={
                        type === "All"
                          ? NeonBoard.volt
                          : typeAccent({ Type: type })
                      }
                      onPress={() => setMediaType(type)}
                    />
                  ))}
                </View>
                {listHeader}
              </View>
            ) : (
              listHeader
            )
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
