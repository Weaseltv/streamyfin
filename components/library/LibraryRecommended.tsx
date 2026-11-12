import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/common/Chip";
import { PageHead } from "@/components/common/PageHead";
import { ScrollingCollectionList } from "@/components/home/ScrollingCollectionList";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  cachedJustWatchLists,
  cachedServiceCodes,
  JUSTWATCH_HOME_PREFS,
  loadRankedItems,
} from "@/utils/justWatchLists";
import {
  loadJustAdded,
  loadJustReleased,
  loadSuggestions,
  uniqueRowIds,
} from "@/utils/libraryRecommended";
import {
  loadStreamingCollections,
  streamingServiceCode,
} from "@/utils/streamingCollections";
import { loadStreamingOrder } from "@/utils/streamingOrder";

export type LibraryView = "recommended" | "library";

/** RECOMMENDED / LIBRARY, the Movies and TV Shows libraries' two views (the TV's first two tabs). */
export const LibraryViewToggle: React.FC<{
  value: LibraryView;
  accent: string;
  onChange: (view: LibraryView) => void;
}> = ({ value, accent, onChange }) => {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 12,
      }}
    >
      {(["recommended", "library"] as const).map((view) => (
        <Chip
          key={view}
          label={t(
            view === "recommended"
              ? "library.tab_recommended"
              : "library.tab_library",
          )}
          selected={value === view}
          accent={accent}
          onPress={() => onChange(view)}
        />
      ))}
    </View>
  );
};

/** One Recommended row: its place in the list and how to load its cards. */
type RecommendedRow = {
  /** The row's identity in the list; never shared by two rows. */
  id: string;
  /** The last part of the row's query name; rows with the same one share a list. */
  key: string;
  kicker: string;
  title: string;
  load: (signal?: AbortSignal) => Promise<BaseItemDto[]>;
};

const rowId = (row: RecommendedRow) => row.id;
// The space under a row belongs to the row, so one that hides itself (an
// empty list) leaves no gap behind.
const ROW_GAP = 4;
const ROW_STYLE = { marginBottom: ROW_GAP } as const;

/**
 * The Recommended view of the Movies and TV Shows libraries, as on the TV:
 * JUST / RELEASED, JUST / ADDED, YOUR / SUGGESTIONS, then TOP 10 / ON
 * <SERVICE> for every streaming service in the member's order, from the lists
 * the media server saves (`justwatch-home`, `top_10_movies_<code>` /
 * `top_10_shows_<code>`, each collection's code from its `service_codes`).
 */
export const LibraryRecommended: React.FC<{
  library: BaseItemDto;
  accent: string;
  eyebrow: string;
  onChangeView: (view: LibraryView) => void;
}> = ({ library, accent, eyebrow, onChangeView }) => {
  const { t } = useTranslation();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const insets = useSafeAreaInsets();
  const userId = user?.Id;
  const libraryId = library.Id ?? "";
  const libraryName = library.Name ?? "";
  const movies = library.CollectionType === "movies";

  const { data: services } = useQuery({
    queryKey: ["library-recommended", "services", userId],
    queryFn: async ({ signal }) => {
      if (!api || !userId) return [];
      const [collections, serverCodes] = await Promise.all([
        loadStreamingCollections(
          api,
          userId,
          signal,
          loadStreamingOrder(userId),
        ),
        // The built-in table if the server's codes can't be read
        cachedServiceCodes(api, userId).catch(() => null),
      ]);
      return collections.flatMap((collection) => {
        const code = streamingServiceCode(collection, serverCodes);
        return code ? [{ code, name: collection.Name ?? "" }] : [];
      });
    },
    enabled: !!api && !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Every row, in order. Built from the library's id and type rather than the
  // record itself, so a newer copy of the same library changes nothing here.
  const rows = useMemo((): RecommendedRow[] => {
    if (!api || !userId) return [];
    const target = { id: libraryId, movies };
    const list: Omit<RecommendedRow, "id">[] = [
      {
        key: "released",
        kicker: t("library.kicker_just"),
        title: t("library.released"),
        load: (signal) => loadJustReleased(api, userId, target, signal),
      },
      {
        key: "added",
        kicker: t("library.kicker_just"),
        title: t("library.added"),
        load: (signal) => loadJustAdded(api, userId, target, signal),
      },
      {
        key: "suggestions",
        kicker: t("library.kicker_your"),
        title: t("library.suggestions"),
        load: (signal) => loadSuggestions(api, userId, target, signal),
      },
      // A service without a weekly chart (Showtime, whose would repeat
      // Paramount+'s) has an empty list, so its row stays hidden
      ...(services ?? []).map((service) => ({
        key: `top10-${service.code}`,
        kicker: t("library.kicker_top_10"),
        title: t("library.on_service", { service: service.name }),
        load: (signal?: AbortSignal) =>
          cachedJustWatchLists(api, userId, JUSTWATCH_HOME_PREFS).then(
            (lists) =>
              loadRankedItems(
                api,
                userId,
                lists[
                  `top_10_${movies ? "movies" : "shows"}_${service.code}`
                ] ?? [],
                10,
                signal,
              ),
          ),
      })),
    ];
    const ids = uniqueRowIds(list.map((row) => row.key));
    return list.map((row, index) => ({ ...row, id: ids[index] }));
  }, [api, userId, libraryId, movies, services, t]);

  const renderRow = useCallback(
    ({ item: row }: { item: RecommendedRow }) => (
      <ScrollingCollectionList
        kicker={row.kicker}
        title={row.title}
        accent={accent}
        queryKey={["library-recommended", libraryId, userId, row.key]}
        queryFn={({ signal }) => row.load(signal)}
        hideIfEmpty
        style={ROW_STYLE}
      />
    ),
    [accent, libraryId, userId],
  );

  // An element, not a component, so the head is not remounted on a render.
  const header = useMemo(
    () => (
      <>
        <PageHead
          eyebrow={eyebrow}
          title={libraryName}
          accent={accent}
          bleedRule
        />
        <LibraryViewToggle
          value='recommended'
          accent={accent}
          onChange={onChangeView}
        />
      </>
    ),
    [eyebrow, libraryName, accent, onChangeView],
  );

  // A list of rows, as on Home: a row is built, and asks the server for its
  // cards, when it comes near the screen. With three rows and one per
  // streaming service, a plain ScrollView built and loaded all of them when
  // the page opened. Each row is its own item type, so a row is never
  // recycled into another: once shown it stays as it is (cards, sideways
  // position, loaded list) for as long as the page is open.
  return (
    <FlashList
      data={rows}
      keyExtractor={rowId}
      getItemType={rowId}
      renderItem={renderRow}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        // With the last row's own gap, the 24 the page ended on before
        paddingBottom: 24 - ROW_GAP,
      }}
      ListHeaderComponent={header}
    />
  );
};
