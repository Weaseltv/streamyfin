import { Feather } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { t } from "i18next";
import orderBy from "lodash/orderBy";
import type React from "react";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Badge } from "@/components/Badge";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { LoadingLine } from "@/components/common/LoadingLine";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { dateOpts } from "@/components/jellyseerr/DetailFacts";
import JellyseerrStatusIcon from "@/components/jellyseerr/JellyseerrStatusIcon";
import { SeasonRow } from "@/components/jellyseerr/RequestModal";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import {
  isSeasonPickable,
  type RequestSeason,
  type SeasonPickerStart,
} from "@/utils/requestSeasons";

const ACCENT = sectionAccent("requests");

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
  /** The show's seasons without specials, with their status (`requestSeasonsFor`). */
  seasons: RequestSeason[];
  /** Opens the season picker: everything pickable ticked, or one season. */
  onRequestSeasons: (start: SeasonPickerStart) => void;
}> = ({ isLoading, details, seasons, onRequestSeasons }) => {
  const [seasonStates, setSeasonStates] = useState<{ [key: number]: boolean }>(
    {},
  );
  const anyPickable = useMemo(() => seasons.some(isSeasonPickable), [seasons]);

  if (!details) return null;

  const header = (
    <SectionHeader
      title={t("item_card.seasons")}
      accent={ACCENT}
      count={isLoading ? undefined : seasons.length}
      actionLabel={
        !isLoading && anyPickable ? t("jellyseerr.request_all") : undefined
      }
      onPressAction={() => onRequestSeasons("all")}
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
      data={orderBy(seasons, "seasonNumber", "desc")}
      ListHeaderComponent={() => header}
      renderItem={({ item: season }) => {
        const canRequest = isSeasonPickable(season);
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
                      ? () => onRequestSeasons(season.seasonNumber)
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
