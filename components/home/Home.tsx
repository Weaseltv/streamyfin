import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getSuggestionsApi,
  getTvShowsApi,
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import { type QueryFunction, useQuery } from "@tanstack/react-query";
import { useNavigation, useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { LoadingLine } from "@/components/common/LoadingLine";
import { OfflineNotice } from "@/components/common/OfflineNotice";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { HeroBand } from "@/components/home/HeroBand";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList";
import { ItemCard, RAIL_GAP, railCardWidth } from "@/components/home/ItemCard";
import { LargeMovieCarousel } from "@/components/home/LargeMovieCarousel";
import { StreamystatsPromotedWatchlists } from "@/components/home/StreamystatsPromotedWatchlists";
import { StreamystatsRecommendations } from "@/components/home/StreamystatsRecommendations";
import { ItemCardText } from "@/components/ItemCardText";
import { MediaListSection } from "@/components/medialists/MediaListSection";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useRefreshLibraryOnFocus } from "@/hooks/useRefreshLibraryOnFocus";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useDownload } from "@/providers/DownloadProvider";
import { useIntroSheet } from "@/providers/IntroSheetProvider";
import {
  apiAtom,
  pendingAccountSaveAtom,
  userAtom,
} from "@/providers/JellyfinProvider";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { useDismissedNextUp } from "@/utils/atoms/dismissedNextUp";
import { SortByOption, SortOrderOption } from "@/utils/atoms/filters";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import { storage } from "@/utils/mmkv";
import { serverHost } from "@/utils/serverHost";
import { sortWeaselLibraries } from "@/utils/weaselLibraryOrder";

// Conditionally load TV version
/**
 * How long the priority-1 sections get to settle before lower-priority ones are
 * released anyway. Only reached when a request hangs rather than resolving or
 * rejecting; a healthy or cleanly-failing Home passes the gate well before this.
 */
const PRIORITY_GATE_DEADLINE_MS = 8000;

const HomeTV = Platform.isTV ? require("./Home.tv").Home : null;

type InfiniteScrollingCollectionListSection = {
  type: "InfiniteScrollingCollectionList";
  title?: string;
  queryKey: (string | undefined | null)[];
  queryFn: QueryFunction<BaseItemDto[], any, number>;
  orientation?: "horizontal" | "vertical";
  pageSize?: number;
  priority?: 1 | 2; // 1 = high priority (loads first), 2 = low priority
  parentId?: string; // Library ID for "See All" navigation
};

type MediaListSectionType = {
  type: "MediaListSection";
  queryKey: (string | undefined)[];
  queryFn: QueryFunction<BaseItemDto>;
  priority?: 1 | 2;
};

type Section = InfiniteScrollingCollectionListSection | MediaListSectionType;

const HomeMobile = () => {
  useSetPageAccent(NeonBoard.volt);
  const router = useRouter();
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { excludeItem: excludeDismissedSeries } = useDismissedNextUp();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const { settings, refreshStreamyfinPluginSettings } = useSettings();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const { downloadedItems, cleanCacheDirectory } = useDownload();
  const prevIsConnected = useRef<boolean | null>(false);
  const {
    isConnected,
    serverConnected,
    loading: retryLoading,
    retryCheck,
  } = useNetworkStatus();
  const invalidateCache = useInvalidatePlaybackProgressCache();
  const [settledSections, setSettledSections] = useState<Set<string>>(
    new Set(),
  );
  /**
   * Releases the priority gate unconditionally once the initial stagger has had
   * long enough. A request that neither resolves nor rejects — a reachable but
   * unresponsive server — would otherwise hold every lower-priority section at
   * enabled={false} indefinitely.
   */
  const [priorityDeadlinePassed, setPriorityDeadlinePassed] = useState(false);
  const { showIntro } = useIntroSheet();
  // Gate the intro so it can't steal presentation from the post-login
  // save-account sheet (both are BottomSheetModals): wait until no save is pending.
  const pendingAccountSave = useAtomValue(pendingAccountSaveAtom);

  // Fallback refresh for newly added content when returning to the home screen
  // (primary path is the LibraryChanged WebSocket event).
  useRefreshLibraryOnFocus();

  // Show intro modal on first launch
  useEffect(() => {
    const hasShownIntro = storage.getBoolean("hasShownIntro");
    // Defer while the save-account sheet is up; this effect re-runs and schedules
    // the intro once the sheet is dismissed (pendingAccountSaveAtom cleared).
    if (!hasShownIntro && !pendingAccountSave) {
      const timer = setTimeout(() => {
        showIntro();
      }, 1000);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [showIntro, pendingAccountSave]);

  useEffect(() => {
    if (isConnected && !prevIsConnected.current) {
      invalidateCache();
    }
    prevIsConnected.current = isConnected;
  }, [isConnected, invalidateCache]);

  const hasDownloads = useMemo(() => {
    if (Platform.isTV) return false;
    return downloadedItems.length > 0;
  }, [downloadedItems]);

  useEffect(() => {
    if (Platform.isTV) {
      navigation.setOptions({
        headerLeft: () => null,
      });
    }
  }, [navigation]);

  // The hero band: the first few resume items with their streams, so the
  // quality badge and time left can be drawn. Off when the popular plugin
  // owns the band.
  const { data: heroItems } = useQuery({
    queryKey: ["home", "hero", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];
      const response = await getItemsApi(api).getResumeItems({
        userId: user.Id,
        enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        includeItemTypes: ["Movie", "Episode"],
        fields: ["MediaStreams"],
        startIndex: 0,
        limit: 5,
      });
      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && settings?.usePopularPlugin !== true,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    cleanCacheDirectory().catch((_e) =>
      console.error("Something went wrong cleaning cache directory"),
    );
  }, []);

  const segments = useSegments();
  useEffect(() => {
    const unsubscribe = eventBus.on("scrollToTop", () => {
      if ((segments as string[])[2] === "(home)")
        scrollRef.current?.scrollTo({
          y: Platform.isTV ? -152 : -100,
          animated: true,
        });
    });

    return () => {
      unsubscribe();
    };
  }, [segments]);

  const {
    data,
    isError: e1,
    isLoading: l1,
  } = useQuery({
    queryKey: ["home", "userViews", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) {
        return null;
      }

      const response = await getUserViewsApi(api).getUserViews({
        userId: user.Id,
      });

      return sortWeaselLibraries(response.data.Items) || null;
    },
    enabled: !!api && !!user?.Id,
    staleTime: 60 * 1000,
  });

  const userViews = useMemo(
    () => data?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!)),
    [data, settings?.hiddenLibraries],
  );

  const collections = useMemo(() => {
    const allow = ["movies", "tvshows"];
    return (
      userViews?.filter(
        (c) => c.CollectionType && allow.includes(c.CollectionType),
      ) || []
    );
  }, [userViews]);

  const refetch = async () => {
    setLoading(true);
    // Do NOT reset settledSections here. The priority gate only exists to
    // stagger the initial mount; every section is already on screen by the
    // time the user can pull. Clearing it flipped every priority-2 section
    // ("Recently added in …", suggestions) to enabled={false}, and
    // invalidateQueries only refetches *active* queries, so those rows were
    // marked stale but never refetched. They could not recover either:
    // InfiniteScrollingCollectionList fires onSettled once per mount, so the
    // gate never reopened until the app was force-quit and remounted.
    await refreshStreamyfinPluginSettings();
    // force: pulling to refresh is the user asserting they want fresh data.
    // The gated path skips invalidation whenever onlineManager reports offline
    // and resolves silently, so the spinner completes and nothing refetches.
    // Automatic callers keep the gated path so offline sessions keep a cache.
    await invalidateCache(true);
    setLoading(false);
  };

  const createCollectionConfig = useCallback(
    (
      title: string,
      queryKey: string[],
      includeItemTypes: BaseItemKind[],
      parentId: string | undefined,
      pageSize: number = 10,
    ): InfiniteScrollingCollectionListSection => ({
      title,
      queryKey,
      queryFn: async ({ pageParam = 0 }) => {
        if (!api) return [];
        // Use getItems (not getLatestMedia) so we get item-level results
        // filtered by type from a specific library. getLatestMedia is
        // episode-oriented and groups results, which drops Series when
        // combined with a parentId + includeItemTypes filter.
        //
        // The specific reason for this is jellyfin 12.0 returns episodes, seasons, or shows,
        // but we only handle shows in our recently added in [shows] section. So we need to filter by type at the item level.
        //
        // For Series we sort by DateLastContentAdded so shows bubble up when
        // a new episode is added (series cards for new episodes, matching how
        // Jellyfin's "Latest" row worked pre-12.0). Movies use DateCreated.
        const response = await getItemsApi(api).getItems({
          userId: user?.Id,
          parentId,
          includeItemTypes,
          recursive: true,
          sortBy: includeItemTypes.includes("Series")
            ? ["DateLastContentAdded"]
            : ["DateCreated"],
          sortOrder: ["Descending"],
          startIndex: pageParam,
          limit: pageSize,
          fields: ["PrimaryImageAspectRatio"],
          imageTypeLimit: 1,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        });
        return response.data.Items || [];
      },
      type: "InfiniteScrollingCollectionList",
      pageSize,
      parentId,
    }),
    [api, user?.Id],
  );

  const defaultSections = useMemo(() => {
    if (!api || !user?.Id) return [];

    const latestMediaViews = collections.map((c) => {
      const includeItemTypes: BaseItemKind[] =
        c.CollectionType === "tvshows" ? ["Series"] : ["Movie"];
      const title = t("home.recently_added_in", { libraryName: c.Name });
      const queryKey: string[] = [
        "home",
        `recentlyAddedIn${c.CollectionType}`,
        user.Id!,
        c.Id!,
      ];
      return createCollectionConfig(
        title || "",
        queryKey,
        includeItemTypes,
        c.Id,
        10,
      );
    });

    // Helper to sort items by most recent activity
    const sortByRecentActivity = (items: BaseItemDto[]): BaseItemDto[] => {
      return items.sort((a, b) => {
        const dateA = a.UserData?.LastPlayedDate || a.DateCreated || "";
        const dateB = b.UserData?.LastPlayedDate || b.DateCreated || "";
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
    };

    // Helper to deduplicate items by ID
    const deduplicateById = (items: BaseItemDto[]): BaseItemDto[] => {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (!item.Id || seen.has(item.Id)) return false;
        seen.add(item.Id);
        return true;
      });
    };

    // Build the first sections based on merge setting
    const firstSections: Section[] = settings.mergeNextUpAndContinueWatching
      ? [
          {
            title: t("home.continue_and_next_up"),
            queryKey: ["home", "continueAndNextUp"],
            queryFn: async ({ pageParam = 0 }) => {
              // Fetch both in parallel
              const [resumeResponse, nextUpResponse] = await Promise.all([
                getItemsApi(api).getResumeItems({
                  userId: user.Id,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  includeItemTypes: ["Movie", "Series", "Episode"],
                  startIndex: 0,
                  limit: 20,
                }),
                getTvShowsApi(api).getNextUp({
                  userId: user?.Id,
                  startIndex: 0,
                  limit: 20,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  enableResumable: false,
                }),
              ]);

              const resumeItems = resumeResponse.data.Items || [];
              const nextUpItems = nextUpResponse.data.Items || [];

              // Combine, sort by recent activity, deduplicate
              const combined = [...resumeItems, ...nextUpItems];
              const sorted = sortByRecentActivity(combined);
              const deduplicated = deduplicateById(sorted);

              // Paginate client-side
              return deduplicated.slice(pageParam, pageParam + 10);
            },
            type: "InfiniteScrollingCollectionList",
            orientation: "horizontal",
            pageSize: 10,
            priority: 1,
          },
        ]
      : [
          {
            title: t("home.continue_watching"),
            queryKey: ["home", "resumeItems"],
            queryFn: async ({ pageParam = 0 }) =>
              (
                await getItemsApi(api).getResumeItems({
                  userId: user.Id,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  includeItemTypes: ["Movie", "Series", "Episode"],
                  startIndex: pageParam,
                  limit: 10,
                })
              ).data.Items || [],
            type: "InfiniteScrollingCollectionList",
            orientation: "horizontal",
            pageSize: 10,
            priority: 1,
          },
          {
            title: t("home.next_up"),
            queryKey: ["home", "nextUp-all"],
            queryFn: async ({ pageParam = 0 }) =>
              (
                await getTvShowsApi(api).getNextUp({
                  userId: user?.Id,
                  startIndex: pageParam,
                  limit: 10,
                  enableImageTypes: ["Primary", "Backdrop", "Thumb"],
                  enableResumable: false,
                })
              ).data.Items || [],
            type: "InfiniteScrollingCollectionList",
            orientation: "horizontal",
            pageSize: 10,
            priority: 1,
          },
        ];

    const ss: Section[] = [
      ...firstSections,
      ...latestMediaViews.map((s) => ({ ...s, priority: 2 as const })),
      // Only show Jellyfin suggested movies if StreamyStats recommendations are disabled
      ...(!settings?.streamyStatsMovieRecommendations
        ? [
            {
              title: t("home.suggested_movies"),
              queryKey: ["home", "suggestedMovies", user?.Id],
              queryFn: async ({ pageParam = 0 }: { pageParam?: number }) =>
                (
                  await getSuggestionsApi(api).getSuggestions({
                    userId: user?.Id,
                    startIndex: pageParam,
                    limit: 10,
                    mediaType: ["Video"],
                    type: ["Movie"],
                  })
                ).data.Items || [],
              type: "InfiniteScrollingCollectionList" as const,
              orientation: "vertical" as const,
              pageSize: 10,
              priority: 2 as const,
            },
          ]
        : []),
    ];
    return ss;
  }, [
    api,
    user?.Id,
    collections,
    t,
    createCollectionConfig,
    settings?.streamyStatsMovieRecommendations,
    settings.mergeNextUpAndContinueWatching,
  ]);

  const customSections = useMemo(() => {
    if (!api || !user?.Id || !settings?.home?.sections) return [];
    const ss: Section[] = [];
    settings.home.sections.forEach((section, index) => {
      const id = section.title || `section-${index}`;
      const pageSize = 10;
      ss.push({
        title: t(`${id}`),
        queryKey: ["home", "custom", String(index), section.title ?? null],
        queryFn: async ({ pageParam = 0 }) => {
          if (section.items) {
            const response = await getItemsApi(api).getItems({
              userId: user?.Id,
              startIndex: pageParam,
              limit: section.items?.limit || pageSize,
              recursive: true,
              includeItemTypes: section.items?.includeItemTypes,
              sortBy: section.items?.sortBy,
              sortOrder: section.items?.sortOrder,
              filters: section.items?.filters,
              parentId: section.items?.parentId,
            });
            return response.data.Items || [];
          }
          if (section.nextUp) {
            const response = await getTvShowsApi(api).getNextUp({
              userId: user?.Id,
              startIndex: pageParam,
              limit: section.nextUp?.limit || pageSize,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
              enableResumable: section.nextUp?.enableResumable,
              enableRewatching: section.nextUp?.enableRewatching,
            });
            return response.data.Items || [];
          }
          if (section.latest) {
            // getLatestMedia doesn't support startIndex, so we fetch all and slice client-side
            const allData =
              (
                await getUserLibraryApi(api).getLatestMedia({
                  userId: user?.Id,
                  includeItemTypes: section.latest?.includeItemTypes,
                  limit: section.latest?.limit || 10,
                  isPlayed: section.latest?.isPlayed,
                  groupItems: section.latest?.groupItems,
                })
              ).data || [];

            // Simulate pagination by slicing
            return allData.slice(pageParam, pageParam + pageSize);
          }
          if (section.custom) {
            const response = await api.get<BaseItemDtoQueryResult>(
              section.custom.endpoint,
              {
                params: {
                  ...(section.custom.query || {}),
                  userId: user?.Id,
                  startIndex: pageParam,
                  limit: pageSize,
                },
                headers: section.custom.headers || {},
              },
            );
            return response.data.Items || [];
          }
          return [];
        },
        type: "InfiniteScrollingCollectionList",
        orientation: section?.orientation || "vertical",
        pageSize,
        // First 2 custom sections are high priority
        priority: index < 2 ? 1 : 2,
      });
    });
    return ss;
  }, [api, user?.Id, settings?.home?.sections, t]);

  const sections = settings?.home?.sections ? customSections : defaultSections;

  // Get all high priority section keys and check if all have loaded
  const highPrioritySectionKeys = useMemo(() => {
    return sections
      .filter((s) => s.priority === 1)
      .map((s) => s.queryKey.join("-"));
  }, [sections]);

  const allHighPrioritySettled = useMemo(() => {
    if (priorityDeadlinePassed) return true;
    return highPrioritySectionKeys.every((key) => settledSections.has(key));
  }, [highPrioritySectionKeys, settledSections, priorityDeadlinePassed]);

  useEffect(() => {
    if (allHighPrioritySettled) return;
    const timer = setTimeout(
      () => setPriorityDeadlinePassed(true),
      PRIORITY_GATE_DEADLINE_MS,
    );
    return () => clearTimeout(timer);
  }, [allHighPrioritySettled]);

  const markSectionSettled = useCallback(
    (queryKey: (string | undefined | null)[]) => {
      const key = queryKey.join("-");
      setSettledSections((prev) => new Set(prev).add(key));
    },
    [],
  );

  // Server unreachable with downloads on the phone: the offline notice row
  // and the downloaded items, instead of a dead end.
  if (serverConnected === false && hasDownloads && !Platform.isTV) {
    return (
      <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <OfflineNotice
            host={serverHost(api?.basePath)}
            onRetry={retryCheck}
            loading={retryLoading}
          />
          <OfflineModeProvider isOffline>
            <SectionHeader
              title={t("states.downloads_title")}
              count={downloadedItems.length}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View
                style={{
                  paddingHorizontal: Sizes.gutter,
                  flexDirection: "row",
                  gap: RAIL_GAP,
                }}
              >
                {downloadedItems.map((d) => (
                  <TouchableItemRouter
                    key={d.item.Id}
                    item={d.item}
                    style={{ width: railCardWidth("vertical") }}
                  >
                    <ItemCard item={d.item} orientation='vertical' />
                    <ItemCardText item={d.item} />
                  </TouchableItemRouter>
                ))}
              </View>
            </ScrollView>
          </OfflineModeProvider>
        </ScrollView>
      </View>
    );
  }

  if (!isConnected || serverConnected !== true) {
    let title = "";
    let subtitle = "";

    if (!isConnected) {
      title = t("home.no_internet");
      subtitle = t("home.no_internet_message");
    } else if (serverConnected === null) {
      title = t("home.checking_server_connection");
      subtitle = t("home.checking_server_connection_message");
    } else if (!serverConnected) {
      title = t("home.server_unreachable");
      subtitle = t("home.server_unreachable_message");
    }
    const waiting = isConnected && serverConnected === null;
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: NeonBoard.stage,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: waiting ? NeonBoard.warn : NeonBoard.red,
            backgroundColor: NeonBoard.card,
            marginBottom: 16,
          }}
        >
          <Ionicons
            name={waiting ? "time-outline" : "cloud-offline-outline"}
            size={26}
            color={waiting ? NeonBoard.warn : NeonBoard.red}
          />
        </View>
        <Text variant='pageTitle' style={{ fontSize: 22, textAlign: "center" }}>
          {title}
        </Text>
        <Text
          variant='body'
          muted
          style={{ fontSize: 13, textAlign: "center", marginTop: 6 }}
        >
          {subtitle}
        </Text>

        <View style={{ marginTop: 20, width: "100%", gap: 10 }}>
          {!waiting && (
            <Button
              variant='border'
              onPress={retryCheck}
              loading={retryLoading}
              iconLeft={
                <Ionicons name='refresh' size={16} color={NeonBoard.volt} />
              }
            >
              {t("home.retry")}
            </Button>
          )}
          {!Platform.isTV && hasDownloads && (
            <Button
              color='white'
              variant='border'
              onPress={() => router.push("/(auth)/downloads")}
            >
              {t("home.go_to_downloads")}
            </Button>
          )}
        </View>
      </View>
    );
  }

  if (e1)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: NeonBoard.stage,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: NeonBoard.red,
            backgroundColor: NeonBoard.card,
            marginBottom: 16,
          }}
        >
          <Ionicons
            name='alert-circle-outline'
            size={26}
            color={NeonBoard.red}
          />
        </View>
        <Text variant='pageTitle' style={{ fontSize: 22 }}>
          {t("home.oops")}
        </Text>
        <Text
          variant='body'
          muted
          style={{ fontSize: 13, textAlign: "center", marginTop: 6 }}
        >
          {t("home.error_message")}
        </Text>
        <Button
          variant='border'
          onPress={refetch}
          style={{ marginTop: 20, alignSelf: "stretch" }}
        >
          {t("home.retry")}
        </Button>
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <LoadingLine active={l1} />
      <ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        contentInsetAdjustmentBehavior='automatic'
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refetch}
            tintColor={NeonBoard.volt}
            colors={[NeonBoard.volt]}
            progressBackgroundColor={NeonBoard.card}
          />
        }
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: 16,
        }}
      >
        {settings?.usePopularPlugin ? (
          <LargeMovieCarousel />
        ) : heroItems && heroItems.length > 0 ? (
          <HeroBand items={heroItems} eyebrow={t("home.continue_watching")} />
        ) : null}
        <View className='flex flex-col' style={{ gap: 4 }}>
          {sections.map((section, index) => {
            // Render Streamystats sections after Recently Added sections
            // For default sections: place after Recently Added, before Suggested Movies (if present)
            // For custom sections: place at the very end
            const hasSuggestedMovies =
              !settings?.streamyStatsMovieRecommendations &&
              !settings?.home?.sections;
            const streamystatsIndex =
              sections.length - 1 - (hasSuggestedMovies ? 1 : 0);
            const hasStreamystatsContent =
              settings.streamyStatsMovieRecommendations ||
              settings.streamyStatsSeriesRecommendations ||
              settings.streamyStatsPromotedWatchlists;
            const streamystatsSections =
              index === streamystatsIndex && hasStreamystatsContent ? (
                <View
                  key='streamystats-sections'
                  className='flex flex-col space-y-4'
                >
                  {settings.streamyStatsMovieRecommendations && (
                    <StreamystatsRecommendations
                      title={t(
                        "home.settings.plugins.streamystats.recommended_movies",
                      )}
                      type='Movie'
                      enabled={allHighPrioritySettled}
                    />
                  )}
                  {settings.streamyStatsSeriesRecommendations && (
                    <StreamystatsRecommendations
                      title={t(
                        "home.settings.plugins.streamystats.recommended_series",
                      )}
                      type='Series'
                      enabled={allHighPrioritySettled}
                    />
                  )}
                  {settings.streamyStatsPromotedWatchlists && (
                    <StreamystatsPromotedWatchlists
                      enabled={allHighPrioritySettled}
                    />
                  )}
                </View>
              ) : null;
            if (section.type === "InfiniteScrollingCollectionList") {
              const isHighPriority = section.priority === 1;
              const handleSeeAll = section.parentId
                ? () => {
                    router.push({
                      pathname: "/(auth)/(tabs)/(libraries)/[libraryId]",
                      params: {
                        libraryId: section.parentId!,
                        sortBy: SortByOption.DateCreated,
                        sortOrder: SortOrderOption.Descending,
                      },
                    } as any);
                  }
                : undefined;
              return (
                <View key={index} className='flex flex-col space-y-4'>
                  <InfiniteScrollingCollectionList
                    title={section.title}
                    queryKey={section.queryKey}
                    queryFn={section.queryFn}
                    orientation={section.orientation}
                    // Only the two rails Jellyfin's Next Up feeds into. Dismissing a
                    // series must not hide its episodes from Recently Added or a library.
                    excludeItem={
                      section.queryKey[1] === "continueAndNextUp" ||
                      section.queryKey[1] === "nextUp-all"
                        ? excludeDismissedSeries
                        : undefined
                    }
                    hideIfEmpty
                    pageSize={section.pageSize}
                    enabled={isHighPriority || allHighPrioritySettled}
                    onSettled={
                      isHighPriority
                        ? () => markSectionSettled(section.queryKey)
                        : undefined
                    }
                    onPressSeeAll={handleSeeAll}
                  />
                  {streamystatsSections}
                </View>
              );
            }
            if (section.type === "MediaListSection") {
              return (
                <View key={index} className='flex flex-col space-y-4'>
                  <MediaListSection
                    queryKey={section.queryKey}
                    queryFn={section.queryFn}
                  />
                  {streamystatsSections}
                </View>
              );
            }
            return null;
          })}
        </View>
      </ScrollView>
    </View>
  );
};

// Exported component that renders TV or mobile version based on platform
export const Home = () => {
  if (Platform.isTV && HomeTV) {
    return <HomeTV />;
  }
  return <HomeMobile />;
};
