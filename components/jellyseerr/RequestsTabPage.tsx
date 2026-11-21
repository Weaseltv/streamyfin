import { useActionSheet } from "@expo/react-native-action-sheet";
import { useFocusEffect } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Keyboard,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  type TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PageHead } from "@/components/common/PageHead";
import {
  ActivityQueue,
  useActivityRows,
} from "@/components/jellyseerr/activity/ActivityQueue";
import {
  JellyseerrSearchSort,
  JellyserrIndexPage,
} from "@/components/jellyseerr/JellyseerrIndexPage";
import {
  DiscoverFilters,
  type DiscoverMediaFilter,
} from "@/components/search/DiscoverFilters";
import { SearchField } from "@/components/search/SearchField";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { jellyseerrUserAtom, useJellyseerr } from "@/hooks/useJellyseerr";
import { useRequestQueue, wakeRequestSync } from "@/hooks/useRequestStatus";
import { useSearchQuery } from "@/hooks/useSearchQuery";
import {
  currentProgressTransport,
  LIVE_REFRESH_EVENT,
} from "@/providers/RequestLiveController";
import { requestScopeBridge } from "@/providers/RequestStatusCoordinator";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import {
  requestLiveGateAtom,
  requestOpenIntentAtom,
  requestProgressAtom,
  requestQueueAtom,
  requestQueueVisibleAtom,
} from "@/utils/atoms/requestStatus";
import { eventBus } from "@/utils/eventBus";
import type { ActivityRowView } from "@/utils/requestStatus/activityRow";
import { canCancel, cancelPath } from "@/utils/requestStatus/cancel";
import {
  READY_PAGE,
  readyRenderCount,
  resolveIntent,
} from "@/utils/requestStatus/intent";
import type { RowMetadata } from "@/utils/requestStatus/metadata";
import { lookupLibraryItemId } from "@/utils/requestStatus/sync";
import { store } from "@/utils/store";

const ACCENT = sectionAccent("requests");

/**
 * The phone's Requests tab (plan 5.6): the request search box on top (sticky), the member's queue
 * below. Typing shows request search results; clearing shows the queue again.
 */
export function RequestsTabPage() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  useSetPageAccent(ACCENT);
  const queue = useRequestQueue();
  const { jellyseerrApi: client } = useJellyseerr();

  const [search, setSearch] = useState("");
  const { query: debouncedSearch, submit: submitSearch } = useSearchQuery(
    search,
    {
      delay: 400,
      minimumLength: 2,
    },
  );
  const typing = search.trim().length > 0;
  const [orderBy, setOrderBy] = useState<JellyseerrSearchSort>(
    JellyseerrSearchSort[
      JellyseerrSearchSort.DEFAULT
    ] as unknown as JellyseerrSearchSort,
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [mediaFilter, setMediaFilter] =
    useState<DiscoverMediaFilter>(undefined);

  const scrollRef = useRef<ScrollView>(null);
  const searchFieldRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [readyCount, setReadyCount] = useState(READY_PAGE);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const queueOffset = useRef(0);
  const rowOffsets = useRef(new Map<number, number>());
  const [layoutTick, setLayoutTick] = useState(0);
  const rows = useActivityRows(queue, client);
  // Read by callbacks without making them change on every live update (rows stay memoized).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const intent = useAtomValue(requestOpenIntentAtom);
  const seerrUser = useAtomValue(jellyseerrUserAtom);
  const proof = useAtomValue(requestProgressAtom).proof;
  const { showActionSheetWithOptions } = useActionSheet();
  const [cancelling, setCancelling] = useState<ReadonlySet<number>>(new Set());

  // Cancel is offered only for a row that may be cancelled and a path that exists (plan 5.7).
  const isCancellable = useCallback(
    (view: ActivityRowView) => {
      const q = store.get(requestQueueAtom);
      if (q.phase !== "ready" || !q.verified) return false;
      if (
        !canCancel(
          view.item,
          view.section,
          q.seerrUserId,
          seerrUser?.permissions,
        )
      )
        return false;
      const progressAvailable =
        q.pinned && proof === "held" && !!currentProgressTransport();
      return cancelPath(view.item, progressAvailable) !== null;
    },
    [seerrUser?.permissions, proof],
  );

  const onCancel = useCallback(
    (view: ActivityRowView, metadata: RowMetadata | undefined) => {
      if (!isCancellable(view)) return;
      const id = view.item.request.id;
      // The sheet pauses live updates while it is open, as on the TV.
      store.set(requestLiveGateAtom, (g) => ({ ...g, sheetOpen: true }));
      showActionSheetWithOptions(
        {
          title:
            metadata?.title ??
            t(
              view.item.request.type === "tv"
                ? "request_status.row.requested_show"
                : "request_status.row.requested_movie",
            ),
          message: t("request_status.cancel.line"),
          options: [
            t("request_status.cancel.confirm"),
            t("request_status.cancel.keep"),
          ],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        async (index) => {
          store.set(requestLiveGateAtom, (g) => ({ ...g, sheetOpen: false }));
          if (index !== 0) return;
          // Checked again on confirm: the row may have moved on meanwhile.
          const latest = rowsRef.current.find((r) => r.item.request.id === id);
          const current = store
            .get(requestQueueAtom)
            .items.find((i) => i.request.id === id);
          if (
            !latest ||
            !current ||
            !isCancellable({ ...latest, item: current })
          ) {
            setMessage(t("request_status.cancel.failed"));
            return;
          }
          setMessage(null);
          setCancelling((s) => new Set(s).add(id));
          try {
            const line = await requestScopeBridge()?.cancel(id);
            if (line) setMessage(t(line.key, line.params));
          } finally {
            setCancelling((s) => {
              const next = new Set(s);
              next.delete(id);
              return next;
            });
          }
        },
      );
    },
    [isCancellable, showActionSheetWithOptions, t],
  );

  // Focus is reported from focus callbacks: the tabs freeze on blur.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      wakeRequestSync();
      return () => setFocused(false);
    }, []),
  );

  // The queue on screen: no unread is added, and unread is cleared.
  const queueVisible = focused && !typing;
  useEffect(() => {
    store.set(requestQueueVisibleAtom, queueVisible);
  }, [queueVisible]);
  useEffect(() => () => store.set(requestQueueVisibleAtom, false), []);

  // The page's part of the live gate (plan 5.5): focused on the index, search box as typed.
  useEffect(() => {
    store.set(requestLiveGateAtom, (g) => ({
      ...g,
      indexFocused: focused,
      searchText: search,
    }));
  }, [focused, search]);
  useEffect(
    () => () =>
      store.set(requestLiveGateAtom, (g) => ({
        ...g,
        indexFocused: false,
        searchText: "",
      })),
    [],
  );

  // A different person or server: their search, results and highlights go at once.
  useEffect(() => {
    setSearch("");
    setReadyCount(READY_PAGE);
    setHighlightedId(null);
    setMessage(null);
    rowOffsets.current.clear();
  }, [queue.accountKey]);

  // Pressing the Requests tab while it is open: clear the box, show the queue, scroll to the top.
  useEffect(
    () =>
      eventBus.on("requestsTabPressed", () => {
        Keyboard.dismiss();
        setSearch("");
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }),
    [],
  );

  // Pull to refresh ends when the read settles.
  useEffect(() => {
    if (refreshing && !queue.loading) setRefreshing(false);
  }, [refreshing, queue.loading]);

  // Highlight a row once.
  useEffect(() => {
    if (highlightedId === null) return;
    const timer = setTimeout(() => setHighlightedId(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  // "Open Requests on this row": handled on focus and when a new one arrives while focused.
  useEffect(() => {
    if (!intent || !focused) return;
    Keyboard.dismiss();
    if (search) {
      setSearch("");
      return;
    }
    const action = resolveIntent(intent, {
      scopeKey: queue.verified ? queue.scopeKey : null,
      rowIds: new Set(rows.map((r) => r.item.request.id)),
      lastSyncSettledAt: queue.lastSyncSettledAt,
    });
    if (action.kind === "wait") return;
    if (action.kind === "scroll") {
      const ready = rows.filter((r) => r.section === "READY");
      const readyIndex = ready.findIndex(
        (r) => r.item.request.id === action.requestId,
      );
      const needed = readyRenderCount(
        readyCount,
        readyIndex >= 0 ? readyIndex : null,
      );
      if (needed !== readyCount) {
        setReadyCount(needed);
        return;
      }
      const y = rowOffsets.current.get(action.requestId);
      if (y === undefined) return;
      scrollRef.current?.scrollTo({
        y: Math.max(0, queueOffset.current + y - 96),
        animated: true,
      });
      setHighlightedId(action.requestId);
    } else if (action.kind === "consume") {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
    store.set(requestOpenIntentAtom, null);
  }, [
    intent,
    focused,
    search,
    rows,
    queue.verified,
    queue.scopeKey,
    queue.lastSyncSettledAt,
    readyCount,
    layoutTick,
  ]);

  const onRowLayout = useCallback(
    (requestId: number, event: LayoutChangeEvent) => {
      rowOffsets.current.set(requestId, event.nativeEvent.layout.y);
      if (store.get(requestOpenIntentAtom)?.requestId === requestId)
        setLayoutTick((n) => n + 1);
    },
    [],
  );

  // Ready renders 30 rows at a time and extends as the scroll nears the end.
  const readyTotal = rows.filter((r) => r.section === "READY").length;
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (typing || readyCount >= readyTotal) return;
      const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
      if (
        layoutMeasurement.height + contentOffset.y >=
        contentSize.height - 600
      ) {
        setReadyCount((c) => c + READY_PAGE);
      }
    },
    [typing, readyCount, readyTotal],
  );

  const onOpen = useCallback(
    async (view: ActivityRowView, metadata: RowMetadata | undefined) => {
      const start = store.get(requestQueueAtom);
      if (start.phase !== "ready" || !client) return;
      const request = view.item.request;
      setMessage(null);
      if (!view.watchable) {
        router.push({
          pathname: "/(auth)/(tabs)/(requests)/jellyseerr/page",
          params: {
            id: String(request.media?.tmdbId ?? ""),
            mediaType: request.type,
            mediaTitle: metadata?.title ?? "",
            releaseYear: metadata?.year ? String(metadata.year) : "",
            posterSrc: metadata?.posterPath
              ? client.imageProxy(metadata.posterPath, "w300_and_h450_face")
              : "",
            canRequest: "false",
          },
        });
        return;
      }
      try {
        const id = await lookupLibraryItemId(
          {
            movie: (tmdb) => client.movieDetails(tmdb) as never,
            tv: (tmdb) => client.tvDetails(tmdb) as never,
          },
          request,
        );
        // The scope and the row must be the same after the read.
        const now = store.get(requestQueueAtom);
        const row = now.items.find((i) => i.request.id === request.id)?.request;
        if (
          !id ||
          !now.verified ||
          now.scopeKey !== start.scopeKey ||
          !row ||
          row.requestedBy?.id !== request.requestedBy?.id ||
          row.media?.tmdbId !== request.media?.tmdbId ||
          row.type !== request.type ||
          (row.is4k === true) !== (request.is4k === true)
        ) {
          throw new Error("changed");
        }
        router.push(
          request.type === "tv"
            ? {
                pathname: "/(auth)/(tabs)/(requests)/series/[id]",
                params: { id },
              }
            : {
                pathname: "/(auth)/(tabs)/(requests)/items/page",
                params: { id },
              },
        );
      } catch {
        setMessage(t("request_status.row.couldnt_open"));
      }
    },
    [client, router, t],
  );

  const searchAllowed = queue.phase === "ready" && queue.verified;

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <ScrollView
        ref={scrollRef}
        keyboardDismissMode='on-drag'
        keyboardShouldPersistTaps='handled'
        contentInsetAdjustmentBehavior='automatic'
        stickyHeaderIndices={[1]}
        onScroll={onScroll}
        scrollEventThrottle={200}
        refreshControl={
          !typing && queue.verified ? (
            <RefreshControl
              refreshing={refreshing}
              tintColor={ACCENT}
              colors={[ACCENT]}
              onRefresh={() => {
                setRefreshing(true);
                eventBus.emit(LIVE_REFRESH_EVENT);
                wakeRequestSync();
              }}
            />
          ) : undefined
        }
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: 60,
        }}
      >
        <PageHead title={t("tabs.requests")} accent={ACCENT} />
        <SearchField
          ref={searchFieldRef}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={submitSearch}
          placeholder={t("search.search")}
          accent={ACCENT}
        />
        {typing && searchAllowed ? (
          <View>
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
              <DiscoverFilters
                mediaFilter={mediaFilter}
                setMediaFilter={setMediaFilter}
                showSort={debouncedSearch.length > 0}
                jellyseerrOrderBy={orderBy}
                setJellyseerrOrderBy={setOrderBy}
                jellyseerrSortOrder={sortOrder}
                setJellyseerrSortOrder={setSortOrder}
                t={t}
              />
            </View>
            <JellyserrIndexPage
              searchQuery={debouncedSearch}
              sortType={orderBy}
              order={sortOrder}
              mediaTypeFilter={mediaFilter}
              showDiscover={false}
            />
          </View>
        ) : (
          <View
            onLayout={(e) => {
              queueOffset.current = e.nativeEvent.layout.y;
            }}
          >
            <ActivityQueue
              queue={queue}
              rows={rows}
              client={client}
              readyCount={readyCount}
              highlightedId={highlightedId}
              message={message}
              onOpen={onOpen}
              onRowLayout={onRowLayout}
              isCancellable={isCancellable}
              onCancel={onCancel}
              cancelling={cancelling}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}
