import { useTranslation } from "react-i18next";
import type { StyleProp, ViewStyle } from "react-native";
import { Badge } from "@/components/Badge";
import { NeonBoard } from "@/constants/Colors";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";

/** Accent for a Seerr media type: movies orange, series yellow. */
export const jellyseerrTypeAccent = (mediaType?: "tv" | "movie" | MediaType) =>
  mediaType === MediaType.MOVIE ? NeonBoard.orange : NeonBoard.yellow;

/** The MOVIE / SERIES type badge in the type colour. */
const JellyseerrMediaIcon: React.FC<{
  mediaType?: "tv" | "movie" | MediaType;
  style?: StyleProp<ViewStyle>;
}> = ({ mediaType, style }) => {
  const { t } = useTranslation();
  if (!mediaType) return null;
  const isMovie = mediaType === MediaType.MOVIE;
  return (
    <Badge
      text={isMovie ? t("search.movies") : t("search.series")}
      tint={jellyseerrTypeAccent(mediaType)}
      glow
      style={style}
    />
  );
};

export default JellyseerrMediaIcon;
