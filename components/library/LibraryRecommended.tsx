import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip } from "@/components/common/Chip";
import { PageHead } from "@/components/common/PageHead";
import { ScrollingCollectionList } from "@/components/home/ScrollingCollectionList";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  cachedJustWatchLists,
  JUSTWATCH_HOME_PREFS,
  loadRankedItems,
} from "@/utils/justWatchLists";
import {
  loadJustAdded,
  loadJustReleased,
  loadSuggestions,
} from "@/utils/libraryRecommended";
import {
  loadStreamingCollections,
  streamingService,
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

/**
 * The Recommended view of the Movies and TV Shows libraries, as on the TV:
 * JUST / RELEASED, JUST / ADDED, YOUR / SUGGESTIONS, then TOP 10 / ON
 * <SERVICE> for every streaming service in the member's order, from the lists
 * the media server saves (`justwatch-home`, `top_10_movies_<code>` /
 * `top_10_shows_<code>`).
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
  const libraryId = library.Id ?? "";
  const movies = library.CollectionType === "movies";
  const target = { id: libraryId, movies };

  const { data: services } = useQuery({
    queryKey: ["library-recommended", "services", user?.Id],
    queryFn: async ({ signal }) => {
      if (!api || !user?.Id) return [];
      const collections = await loadStreamingCollections(
        api,
        user.Id,
        signal,
        loadStreamingOrder(user.Id),
      );
      return collections.flatMap((collection) => {
        const service = streamingService(collection.Name);
        if (!service) return [];
        // "Apple TV+" reads "On Apple TV", as on the TV
        const name =
          collection.Name === "Apple TV+" ? "Apple TV" : collection.Name;
        return [{ code: service.code, name: name ?? "" }];
      });
    },
    enabled: !!api && !!user?.Id,
    staleTime: 5 * 60 * 1000,
  });

  const row = (
    key: string,
    kicker: string,
    title: string,
    load: (signal?: AbortSignal) => Promise<BaseItemDto[]>,
  ) => (
    <ScrollingCollectionList
      key={key}
      kicker={kicker}
      title={title}
      accent={accent}
      queryKey={["library-recommended", libraryId, user?.Id, key]}
      queryFn={({ signal }) =>
        api && user?.Id ? load(signal) : Promise.resolve([])
      }
      hideIfEmpty
    />
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 24,
      }}
    >
      <PageHead
        eyebrow={eyebrow}
        title={library.Name ?? ""}
        accent={accent}
        bleedRule
      />
      <LibraryViewToggle
        value='recommended'
        accent={accent}
        onChange={onChangeView}
      />
      {api && user?.Id ? (
        <View style={{ gap: 4 }}>
          {row(
            "released",
            t("library.kicker_just"),
            t("library.released"),
            (signal) => loadJustReleased(api, user.Id!, target, signal),
          )}
          {row(
            "added",
            t("library.kicker_just"),
            t("library.added"),
            (signal) => loadJustAdded(api, user.Id!, target, signal),
          )}
          {row(
            "suggestions",
            t("library.kicker_your"),
            t("library.suggestions"),
            (signal) => loadSuggestions(api, user.Id!, target, signal),
          )}
          {(services ?? []).map((service) =>
            row(
              `top10-${service.code}`,
              t("library.kicker_top_10"),
              t("library.on_service", { service: service.name }),
              (signal) =>
                cachedJustWatchLists(api, user.Id!, JUSTWATCH_HOME_PREFS).then(
                  (lists) =>
                    loadRankedItems(
                      api,
                      user.Id!,
                      lists[
                        `top_10_${movies ? "movies" : "shows"}_${service.code}`
                      ] ?? [],
                      10,
                      signal,
                    ),
                ),
            ),
          )}
        </View>
      ) : null}
    </ScrollView>
  );
};
