import { useSegments } from "expo-router";
import { orderBy, uniqBy } from "lodash";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { LoadingLine } from "@/components/common/LoadingLine";
import { Image } from "@/components/common/ServerImage";
import Discover from "@/components/jellyseerr/discover/Discover";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { useReactNavigationQuery } from "@/utils/useReactNavigationQuery";
import { Text } from "../common/Text";
import JellyseerrPoster from "../posters/JellyseerrPoster";
import { LoadingSkeleton } from "../search/LoadingSkeleton";
import { SearchItemWrapper } from "../search/SearchItemWrapper";

interface Props extends ViewProps {
  searchQuery: string;
  sortType?: JellyseerrSearchSort;
  order?: "asc" | "desc";
  /** Only show one media type's results (the Movies · Series chips). */
  mediaTypeFilter?: MediaType.MOVIE | MediaType.TV;
  /**
   * Render the Jellyseerr discover sliders (recent requests, trending, popular)
   * when nothing has been typed. WeaselPlex phone turns this off: the Requests
   * tab is a search box, not a browse page, so the empty state is a hint and no
   * discover requests are made at all.
   */
  showDiscover?: boolean;
}

export enum JellyseerrSearchSort {
  DEFAULT = 0,
  VOTE_COUNT_AND_AVERAGE = 1,
  POPULARITY = 2,
}

const AVATAR = 56;

const initials = (name?: string | null) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** A Seerr person: the round 56 avatar, name underneath. */
const JellyseerrPersonAvatar: React.FC<{ person: PersonResult }> = ({
  person,
}) => {
  const { jellyseerrApi } = useJellyseerr();
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const url = jellyseerrApi?.imageProxy(
    person.profilePath,
    "w600_and_h900_bestv2",
  );

  return (
    <TouchableOpacity
      onPress={() =>
        router.push(`/(auth)/(tabs)/${from}/jellyseerr/person/${person.id}`)
      }
      style={{ width: 84, alignItems: "center" }}
    >
      <View
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          overflow: "hidden",
          backgroundColor: NeonBoard.card2,
          borderWidth: 1,
          borderColor: NeonBoard.line2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {person.profilePath && url ? (
          <Image
            id={person.id.toString()}
            source={{ uri: url }}
            style={{ width: AVATAR, height: AVATAR }}
            contentFit='cover'
          />
        ) : (
          <Text variant='tally' muted>
            {initials(person.name)}
          </Text>
        )}
      </View>
      <Text
        variant='cardTitle'
        numberOfLines={1}
        style={{ marginTop: 6, fontSize: 12, textAlign: "center" }}
      >
        {person.name}
      </Text>
    </TouchableOpacity>
  );
};

export const JellyserrIndexPage: React.FC<Props> = ({
  searchQuery,
  sortType,
  order,
  mediaTypeFilter,
  showDiscover = true,
}) => {
  const { jellyseerrApi } = useJellyseerr();
  const { t } = useTranslation();

  const {
    data: jellyseerrDiscoverSettings,
    isFetching: f1,
    isLoading: l1,
  } = useReactNavigationQuery({
    queryKey: ["search", "jellyseerr", "discoverSettings", searchQuery],
    queryFn: async () => jellyseerrApi?.discoverSettings(),
    enabled: !!jellyseerrApi && showDiscover && searchQuery.length === 0,
  });

  const {
    data: jellyseerrResults,
    isFetching: f2,
    isLoading: l2,
  } = useReactNavigationQuery({
    queryKey: ["search", "jellyseerr", "results", searchQuery],
    queryFn: async () => {
      const params = {
        query: new URLSearchParams(searchQuery || "").toString(),
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
    enabled: !!jellyseerrApi && searchQuery.length > 0,
  });

  const loading = f1 || f2 || l1 || l2;

  const sortingType = useMemo(() => {
    if (!sortType) return;
    switch (Number(JellyseerrSearchSort[sortType])) {
      case JellyseerrSearchSort.VOTE_COUNT_AND_AVERAGE:
        return ["voteCount", "voteAverage"];
      case JellyseerrSearchSort.POPULARITY:
        return ["voteCount", "popularity"];
      default:
        return undefined;
    }
  }, [sortType, order]);

  const jellyseerrMovieResults = useMemo(
    () =>
      orderBy(
        jellyseerrResults?.filter(
          (r) => r.mediaType === MediaType.MOVIE,
        ) as MovieResult[],
        sortingType || [
          (m) => m.title.toLowerCase() === searchQuery.toLowerCase(),
        ],
        order || "desc",
      ),
    [jellyseerrResults, sortingType, order],
  );

  const jellyseerrTvResults = useMemo(
    () =>
      orderBy(
        jellyseerrResults?.filter(
          (r) => r.mediaType === MediaType.TV,
        ) as TvResult[],
        sortingType || [
          (t) => t.name.toLowerCase() === searchQuery.toLowerCase(),
        ],
        order || "desc",
      ),
    [jellyseerrResults, sortingType, order],
  );

  const jellyseerrPersonResults = useMemo(
    () =>
      orderBy(
        jellyseerrResults?.filter(
          (r) => r.mediaType === "person",
        ) as PersonResult[],
        sortingType || [
          (p) => p.name.toLowerCase() === searchQuery.toLowerCase(),
        ],
        order || "desc",
      ),
    [jellyseerrResults, sortingType, order],
  );

  const showMovies = mediaTypeFilter !== MediaType.TV;
  const showTv = mediaTypeFilter !== MediaType.MOVIE;
  const showPeople = mediaTypeFilter === undefined;

  const noResults =
    !(showMovies && jellyseerrMovieResults?.length) &&
    !(showTv && jellyseerrTvResults?.length) &&
    !(showPeople && jellyseerrPersonResults?.length);

  if (!searchQuery.length)
    return showDiscover ? (
      <View style={{ paddingTop: 4 }}>
        <LoadingLine active={loading} />
        <Discover sliders={jellyseerrDiscoverSettings} />
      </View>
    ) : (
      <View style={{ paddingHorizontal: 32, paddingTop: 24 }}>
        <Text variant='body' muted style={{ textAlign: "center" }}>
          {t("search.requests_hint")}
        </Text>
      </View>
    );

  return (
    <View>
      <LoadingLine active={loading} />
      <View style={{ marginTop: 4 }}>
        <LoadingSkeleton isLoading={loading} />
      </View>

      {noResults && !loading && (
        <View style={{ alignItems: "center", paddingTop: 24 }}>
          <Text variant='section'>{t("search.no_results_found_for")}</Text>
          <Text variant='meta' accent={NeonBoard.volt} style={{ marginTop: 4 }}>
            "{searchQuery}"
          </Text>
        </View>
      )}

      <View style={{ opacity: loading ? 0 : 1 }}>
        {showMovies && (
          <SearchItemWrapper
            header={t("search.request_movies")}
            accent={NeonBoard.volt}
            items={jellyseerrMovieResults}
            renderItem={(item: MovieResult) => (
              <JellyseerrPoster item={item} key={item.id} />
            )}
          />
        )}
        {showTv && (
          <SearchItemWrapper
            header={t("search.request_series")}
            accent={NeonBoard.volt}
            items={jellyseerrTvResults}
            renderItem={(item: TvResult) => (
              <JellyseerrPoster item={item} key={item.id} />
            )}
          />
        )}
        {showPeople && (
          <SearchItemWrapper
            header={t("search.actors")}
            accent={NeonBoard.volt}
            items={jellyseerrPersonResults}
            renderItem={(item: PersonResult) => (
              <JellyseerrPersonAvatar key={item.id} person={item} />
            )}
          />
        )}
      </View>
    </View>
  );
};
