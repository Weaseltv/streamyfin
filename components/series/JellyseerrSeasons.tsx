import { Feather } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import {
  type QueryObserverResult,
  type RefetchOptions,
  useQuery,
} from "@tanstack/react-query";
import { t } from "i18next";
import { orderBy } from "lodash";
import type React from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { Badge } from "@/components/Badge";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { LoadingLine } from "@/components/common/LoadingLine";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { dateOpts } from "@/components/jellyseerr/DetailFacts";
import JellyseerrStatusIcon from "@/components/jellyseerr/JellyseerrStatusIcon";
import { SeasonRow } from "@/components/jellyseerr/RequestModal";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type Season from "@/utils/jellyseerr/server/entity/Season";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

const ACCENT = NeonBoard.volt;

const JellyseerrSeasonEpisodes: React.FC<{
  details: TvDetails;
  seasonNumber: number;
}> = ({ details, seasonNumber }) => {
  const { jellyseerrApi } = useJellyseerr();

  const { data: seasonWithEpisodes, isLoading } = useQuery({
    queryKey: ["jellyseerr", details.id, "season", seasonNumber],
    queryFn: async () => jellyseerrApi?.tvSeason(details.id, seasonNumber),
    enabled: details.seasons.filter((s) => s.seasonNumber !== 0).length > 0,
  });

  return (
    <HorizontalScroll
      horizontal
      loading={isLoading}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: Sizes.gutter,
        paddingVertical: 10,
      }}
      data={seasonWithEpisodes?.episodes}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item, index) => (
        <RenderItem key={index} item={item} index={index} />
      )}
    />
  );
};

/** A 150×84 episode thumb with the S:E line, the title and a short overview. */
const RenderItem = ({ item }: any) => {
  const {
    jellyseerrApi,
    jellyseerrRegion: region,
    jellyseerrLocale: locale,
  } = useJellyseerr();
  const [imageError, setImageError] = useState(false);

  const upcomingAirDate = useMemo(() => {
    const airDate = item.airDate;
    if (airDate) {
      const airDateObj = new Date(airDate);
      if (new Date() < airDateObj) {
        return airDateObj.toLocaleDateString(`${locale}-${region}`, dateOpts);
      }
    }
  }, [item, locale, region]);

  const box = Sizes.thumbSmall;

  return (
    <View style={{ width: box.w }}>
      <View
        style={{
          width: box.w,
          height: box.h,
          borderWidth: 1,
          borderColor: NeonBoard.line,
          backgroundColor: NeonBoard.card2,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!imageError ? (
          <Image
            key={item.id}
            id={item.id}
            source={{
              uri: jellyseerrApi?.imageProxy(item.stillPath),
            }}
            cachePolicy={"memory-disk"}
            contentFit='cover'
            style={{ width: "100%", height: "100%" }}
            onError={(_e) => {
              setImageError(true);
            }}
          />
        ) : (
          <Feather name='image' size={22} color={NeonBoard.low} />
        )}
        {upcomingAirDate && (
          <Badge
            text={upcomingAirDate}
            tint={NeonBoard.warn}
            style={{ position: "absolute", bottom: 6, right: 6 }}
          />
        )}
      </View>
      <View style={{ marginTop: 6 }}>
        <Text variant='cardTitle' numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant='meta' muted numberOfLines={1}>
          {`S${item.seasonNumber}:E${item.episodeNumber}`}
        </Text>
        {item.overview ? (
          <Text
            variant='caption'
            numberOfLines={3}
            style={{ color: NeonBoard.low, marginTop: 2 }}
          >
            {item.overview}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const JellyseerrSeasons: React.FC<{
  isLoading: boolean;
  details?: TvDetails;
  hasAdvancedRequest?: boolean;
  onAdvancedRequest?: (data: MediaRequestBody) => void;
  refetch: (
    options?: RefetchOptions | undefined,
  ) => Promise<
    QueryObserverResult<TvDetails | MovieDetails | undefined, Error>
  >;
}> = ({
  isLoading,
  details,
  refetch,
  hasAdvancedRequest,
  onAdvancedRequest,
}) => {
  const { jellyseerrApi, requestMedia } = useJellyseerr();
  const [seasonStates, setSeasonStates] = useState<{ [key: number]: boolean }>(
    {},
  );
  const seasons = useMemo(() => {
    if (!details) return [];
    const mediaInfoSeasons = details.mediaInfo?.seasons?.filter(
      (s: Season) => s.seasonNumber !== 0,
    );
    const requestedSeasons =
      details.mediaInfo?.requests?.flatMap((r: MediaRequest) => r.seasons) ??
      [];
    return (
      details.seasons?.map((season) => ({
        ...season,
        status:
          mediaInfoSeasons?.find(
            (mediaSeason: Season) =>
              mediaSeason.seasonNumber === season.seasonNumber,
          )?.status ??
          requestedSeasons?.find(
            (s: Season) => s.seasonNumber === season.seasonNumber,
          )?.status ??
          MediaStatus.UNKNOWN,
      })) ?? []
    );
  }, [details]);
  const allSeasonsAvailable = useMemo(
    () => seasons.every((season) => season.status === MediaStatus.AVAILABLE),
    [seasons],
  );

  const requestAll = useCallback(() => {
    if (details && jellyseerrApi) {
      const body: MediaRequestBody = {
        mediaId: details.id,
        mediaType: MediaType.TV,
        tvdbId: details.externalIds?.tvdbId,
        seasons: seasons
          .filter(
            (s) => s.status === MediaStatus.UNKNOWN && s.seasonNumber !== 0,
          )
          .map((s) => s.seasonNumber),
      };
      if (hasAdvancedRequest) {
        return onAdvancedRequest?.(body);
      }
      requestMedia(details.name, body, refetch);
    }
  }, [
    jellyseerrApi,
    seasons,
    details,
    hasAdvancedRequest,
    onAdvancedRequest,
    requestMedia,
    refetch,
  ]);

  const promptRequestAll = useCallback(
    () =>
      Alert.alert(
        t("jellyseerr.confirm"),
        t("jellyseerr.are_you_sure_you_want_to_request_all_seasons"),
        [
          {
            text: t("jellyseerr.cancel"),
            style: "cancel",
          },
          {
            text: t("jellyseerr.yes"),
            onPress: requestAll,
          },
        ],
      ),
    [requestAll],
  );

  const requestSeason = useCallback(
    async (canRequest: boolean, seasonNumber: number) => {
      if (canRequest && details) {
        const body: MediaRequestBody = {
          mediaId: details.id,
          mediaType: MediaType.TV,
          tvdbId: details.externalIds?.tvdbId,
          seasons: [seasonNumber],
        };
        if (hasAdvancedRequest) {
          return onAdvancedRequest?.(body);
        }
        requestMedia(`${details.name}, Season ${seasonNumber}`, body, refetch);
      }
    },
    [requestMedia, hasAdvancedRequest, onAdvancedRequest, refetch, details],
  );

  if (!details) return null;

  const header = (
    <SectionHeader
      title={t("item_card.seasons")}
      accent={ACCENT}
      count={isLoading ? undefined : seasons.length}
      actionLabel={
        !isLoading && !allSeasonsAvailable
          ? t("jellyseerr.request_all")
          : undefined
      }
      onPressAction={promptRequestAll}
    />
  );

  if (isLoading)
    return (
      <View>
        {header}
        <LoadingLine accent={ACCENT} />
      </View>
    );

  return (
    <FlashList
      data={orderBy(
        seasons.filter((s) => s.seasonNumber !== 0),
        "seasonNumber",
        "desc",
      )}
      ListHeaderComponent={() => header}
      renderItem={({ item: season }) => {
        const canRequest = season.status === MediaStatus.UNKNOWN;
        const expanded = !!seasonStates?.[season.seasonNumber];
        return (
          <>
            <SeasonRow
              season={{
                seasonNumber: season.seasonNumber,
                episodeCount: season.episodeCount,
                status: season.status,
              }}
              leading={
                <Feather
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={NeonBoard.low}
                  style={{ marginRight: 12 }}
                />
              }
              onToggle={() =>
                setSeasonStates((prevState) => ({
                  ...prevState,
                  [season.seasonNumber]: !prevState?.[season.seasonNumber],
                }))
              }
              right={
                <JellyseerrStatusIcon
                  onPress={
                    canRequest
                      ? () => requestSeason(canRequest, season.seasonNumber)
                      : undefined
                  }
                  mediaStatus={season.status}
                  showRequestIcon={canRequest}
                />
              }
            />
            {expanded && (
              <JellyseerrSeasonEpisodes
                key={season.seasonNumber}
                details={details}
                seasonNumber={season.seasonNumber}
              />
            )}
          </>
        );
      }}
    />
  );
};

export default JellyseerrSeasons;
