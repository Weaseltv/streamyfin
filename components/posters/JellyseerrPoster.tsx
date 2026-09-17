import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Badge } from "@/components/Badge";
import { TouchableJellyseerrRouter } from "@/components/common/JellyseerrItemRouter";
import { NeonProgress } from "@/components/common/NeonProgress";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import JellyseerrMediaIcon from "@/components/jellyseerr/JellyseerrMediaIcon";
import JellyseerrStatusIcon, {
  useJellyseerrStatusBadge,
} from "@/components/jellyseerr/JellyseerrStatusIcon";
import { NeonBoard } from "@/constants/Colors";
import { rgba, Sizes } from "@/constants/neon";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useJellyseerrCanRequest } from "@/utils/_jellyseerr/useJellyseerrCanRequest";
import {
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type { DownloadingItem } from "@/utils/jellyseerr/server/lib/downloadtracker";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { PersonCreditCast } from "@/utils/jellyseerr/server/models/Person";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

interface Props {
  item?: MovieResult | TvResult | MovieDetails | TvDetails | PersonCreditCast;
  horizontal?: boolean;
  showDownloadInfo?: boolean;
  mediaRequest?: MediaRequest;
}

/**
 * A Seerr result card: the 96×140 poster (or 150×84 backdrop) in a 1pt
 * `line` frame, the status badge top-left (`Request` in volt when the item
 * can be requested, the type badge when it carries no status), the request
 * progress as a 3pt bar, then the title and "Movie · 2024" meta.
 */
const JellyseerrPoster: React.FC<Props> = ({
  item,
  horizontal,
  showDownloadInfo,
  mediaRequest,
}) => {
  const { jellyseerrApi, getTitle, getYear, getMediaType } = useJellyseerr();
  const imageOpacity = useSharedValue(0);
  const { t } = useTranslation();

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
  }));

  const handleImageLoad = () => {
    imageOpacity.value = withTiming(1, { duration: 300 });
  };

  const backdropSrc = useMemo(
    () =>
      jellyseerrApi?.imageProxy(
        item?.backdropPath,
        "w1920_and_h800_multi_faces",
      ),
    [item, jellyseerrApi],
  );

  const posterSrc = useMemo(
    () => jellyseerrApi?.imageProxy(item?.posterPath, "w300_and_h450_face"),
    [item, jellyseerrApi],
  );

  const title = useMemo(() => getTitle(item), [item]);
  const releaseYear = useMemo(() => getYear(item), [item]);
  const mediaType = useMemo(() => getMediaType(item), [item]);

  const box = horizontal ? Sizes.thumbSmall : Sizes.posterSmall;

  const [canRequest] = useJellyseerrCanRequest(item);

  const is4k = useMemo(() => mediaRequest?.is4k === true, [mediaRequest]);

  const downloadItems = useMemo(
    () =>
      (is4k
        ? mediaRequest?.media.downloadStatus4k
        : mediaRequest?.media.downloadStatus) || [],
    [mediaRequest, is4k],
  );

  const progress = useMemo(() => {
    const [totalSize, sizeLeft] = downloadItems.reduce(
      (sum: number[], next: DownloadingItem) => [
        sum[0] + next.size,
        sum[1] + next.sizeLeft,
      ],
      [0, 0],
    );

    return ((totalSize - sizeLeft) / totalSize) * 100;
  }, [downloadItems]);

  const requestedSeasons: string[] = useMemo(() => {
    const seasons =
      mediaRequest?.seasons?.flatMap((s) => s.seasonNumber.toString()) || [];
    if (seasons.length > 4) {
      const [first, second, third, fourth, ...rest] = seasons;
      return [
        first,
        second,
        third,
        fourth,
        t("home.settings.plugins.jellyseerr.plus_n_more", { n: rest.length }),
      ];
    }
    return seasons;
  }, [mediaRequest]);

  const available = useMemo(() => {
    const status = mediaRequest?.media?.[is4k ? "status4k" : "status"];
    return status === MediaStatus.AVAILABLE;
  }, [mediaRequest, is4k]);

  const mediaStatus = mediaRequest?.media?.status || item?.mediaInfo?.status;
  const statusBadge = useJellyseerrStatusBadge(
    mediaStatus,
    mediaRequest?.status,
    canRequest,
  );

  const typeText =
    mediaType === MediaType.MOVIE
      ? t("search.movies")
      : mediaType === MediaType.TV
        ? t("search.series")
        : undefined;
  const meta = [typeText, releaseYear || undefined].filter(Boolean).join(" · ");

  return (
    <TouchableJellyseerrRouter
      result={item}
      mediaTitle={title}
      releaseYear={releaseYear}
      canRequest={canRequest}
      posterSrc={posterSrc!}
      mediaType={mediaType}
      style={{ width: box.w }}
    >
      <View
        style={{
          width: box.w,
          height: box.h,
          borderWidth: 1,
          borderColor: NeonBoard.line,
          backgroundColor: NeonBoard.card2,
          overflow: "hidden",
        }}
      >
        <Animated.View style={[imageAnimatedStyle, { flex: 1 }]}>
          <Image
            key={item?.id}
            id={item?.id.toString()}
            source={{ uri: horizontal ? backdropSrc : posterSrc }}
            cachePolicy={"memory-disk"}
            contentFit='cover'
            style={{ width: "100%", height: "100%" }}
            onLoad={handleImageLoad}
          />
        </Animated.View>
        {mediaRequest && showDownloadInfo && !available && (
          <View
            pointerEvents='none'
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: rgba(NeonBoard.stage, 0.6),
            }}
          />
        )}
        {statusBadge ? (
          <JellyseerrStatusIcon
            style={{ position: "absolute", top: 6, left: 6 }}
            showRequestIcon={canRequest}
            requestStatus={mediaRequest?.status}
            mediaStatus={mediaStatus}
          />
        ) : (
          <JellyseerrMediaIcon
            style={{ position: "absolute", top: 6, left: 6 }}
            mediaType={mediaType}
          />
        )}
        {mediaRequest && showDownloadInfo && (
          <>
            {mediaRequest.requestedBy?.displayName ? (
              <Badge
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  maxWidth: box.w - 12,
                }}
                text={mediaRequest.requestedBy.displayName}
              />
            ) : null}
            {requestedSeasons.length > 0 && (
              <View
                style={{
                  position: "absolute",
                  left: 6,
                  right: 6,
                  bottom: 8,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 4,
                }}
              >
                {requestedSeasons.map((season) => (
                  <Badge key={season} text={season} tint={NeonBoard.text} />
                ))}
              </View>
            )}
            {!available && !Number.isNaN(progress) && (
              <NeonProgress
                progress={(progress || 0) / 100}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
            )}
          </>
        )}
      </View>
      <View style={{ marginTop: 6 }}>
        <Text variant='cardTitle' numberOfLines={1}>
          {title || ""}
        </Text>
        <Text variant='meta' muted numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </TouchableJellyseerrRouter>
  );
};

export default JellyseerrPoster;
