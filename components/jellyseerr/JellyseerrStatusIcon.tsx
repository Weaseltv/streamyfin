import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type StyleProp, TouchableOpacity, type ViewStyle } from "react-native";
import { Badge } from "@/components/Badge";
import { NeonBoard } from "@/constants/Colors";
import {
  MediaRequestStatus,
  MediaStatus,
} from "@/utils/jellyseerr/server/constants/media";

interface Props {
  mediaStatus?: MediaStatus;
  /** The request's own status, for Approved / Declined when the media has no status yet. */
  requestStatus?: MediaRequestStatus;
  /** Show the volt `Request` badge when the item carries no status. */
  showRequestIcon: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

type StatusBadge = {
  label: string;
  tint: string;
  filled: boolean;
};

/**
 * Maps a Seerr media / request status to a Neon Board badge:
 * Available = green filled, Partial / Processing = cyan, Pending = warn,
 * Approved = green outline, Declined / Blacklisted = red, and `Request` in
 * volt when the item has no status and can be requested.
 */
export const useJellyseerrStatusBadge = (
  mediaStatus?: MediaStatus,
  requestStatus?: MediaRequestStatus,
  showRequestIcon = false,
): StatusBadge | undefined => {
  const { t } = useTranslation();
  return useMemo(() => {
    if (mediaStatus === MediaStatus.AVAILABLE) {
      return {
        label: t("jellyseerr.media_status.available"),
        tint: NeonBoard.green,
        filled: true,
      };
    }
    if (requestStatus === MediaRequestStatus.DECLINED) {
      return {
        label: t("jellyseerr.media_status.declined"),
        tint: NeonBoard.red,
        filled: false,
      };
    }
    switch (mediaStatus) {
      case MediaStatus.PARTIALLY_AVAILABLE:
        return {
          label: t("jellyseerr.media_status.partial"),
          tint: NeonBoard.cyan,
          filled: false,
        };
      case MediaStatus.PROCESSING:
        return {
          label: t("jellyseerr.media_status.processing"),
          tint: NeonBoard.cyan,
          filled: false,
        };
      case MediaStatus.PENDING:
        return {
          label: t("jellyseerr.media_status.pending"),
          tint: NeonBoard.warn,
          filled: false,
        };
      case MediaStatus.BLACKLISTED:
        return {
          label: t("jellyseerr.media_status.blacklisted"),
          tint: NeonBoard.red,
          filled: false,
        };
      default:
        break;
    }
    if (requestStatus === MediaRequestStatus.APPROVED) {
      return {
        label: t("jellyseerr.media_status.approved"),
        tint: NeonBoard.green,
        filled: false,
      };
    }
    if (requestStatus === MediaRequestStatus.PENDING) {
      return {
        label: t("jellyseerr.media_status.pending"),
        tint: NeonBoard.warn,
        filled: false,
      };
    }
    if (requestStatus === MediaRequestStatus.FAILED) {
      return {
        label: t("jellyseerr.media_status.failed"),
        tint: NeonBoard.red,
        filled: false,
      };
    }
    if (showRequestIcon) {
      return {
        label: t("jellyseerr.request_button"),
        tint: NeonBoard.volt,
        filled: false,
      };
    }
    return undefined;
  }, [mediaStatus, requestStatus, showRequestIcon, t]);
};

/** The status badge on Seerr posters and season rows. */
const JellyseerrStatusIcon: React.FC<Props> = ({
  mediaStatus,
  requestStatus,
  showRequestIcon,
  onPress,
  style,
}) => {
  const badge = useJellyseerrStatusBadge(
    mediaStatus,
    requestStatus,
    showRequestIcon,
  );

  if (!badge) return null;

  const element = (
    <Badge
      text={badge.label}
      tint={badge.tint}
      variant={badge.filled ? "filled" : "outline"}
      glow
      style={onPress ? undefined : style}
    />
  );

  if (!onPress) return element;

  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={6}
      accessibilityRole='button'
      style={style}
    >
      {element}
    </TouchableOpacity>
  );
};

export default JellyseerrStatusIcon;
