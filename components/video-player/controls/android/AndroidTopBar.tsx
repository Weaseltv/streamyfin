import { MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { type FC, type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";
import {
  type OptionGroup,
  PlatformDropdown,
} from "@/components/PlatformDropdown";
import { formatEpisodeNumber } from "@/utils/episodes";
import { IOS_PLAYER } from "./layout";
import type { AndroidPlayerMenus } from "./useAndroidPlayerMenus";

interface Props {
  item: BaseItemDto;
  /** iOS `compact`: portrait phones (width < 500). */
  compact: boolean;
  menus: AndroidPlayerMenus;
  /** Audio and subtitle switching is off for offline transcoded files. */
  showTrackMenus: boolean;
  onClose: () => void;
  startPictureInPicture?: () => void;
  isZoomedToFill: boolean;
  onZoomToggle?: () => void;
  onShowEpisodes?: () => void;
  /** Touch-down on a menu button keeps the chrome up for the iOS 15 s. */
  onMenuTouch: () => void;
}

/** iOS PlayerViewModel metadata: "2019" for a film, "Series · S1E2" for an episode. */
const subtitleFor = (item: BaseItemDto): string | undefined => {
  if (item.Type === "Episode") {
    const episode =
      item.ParentIndexNumber !== undefined && item.IndexNumber !== undefined
        ? formatEpisodeNumber(item, {
            includeSeason: true,
            seasonSeparator: "",
          })
        : undefined;
    return [item.SeriesName, episode].filter(Boolean).join(" · ") || undefined;
  }
  return item.ProductionYear ? String(item.ProductionYear) : undefined;
};

/**
 * The iPhone player's top bar (PlayerTopBar.swift): close, title block, then
 * picture in picture, zoom (landscape), episodes, speed (landscape), audio,
 * subtitles and "…". White glyphs on the scrim, no button chrome.
 */
export const AndroidTopBar: FC<Props> = ({
  item,
  compact,
  menus,
  showTrackMenus,
  onClose,
  startPictureInPicture,
  isZoomedToFill,
  onZoomToggle,
  onShowEpisodes,
  onMenuTouch,
}) => {
  const { t } = useTranslation();
  const size = compact
    ? IOS_PLAYER.barButtonCompact
    : IOS_PLAYER.barButtonRegular;
  const subtitle = subtitleFor(item);

  return (
    <View
      pointerEvents='box-none'
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: IOS_PLAYER.barSpacing,
      }}
    >
      <BarButton
        size={size}
        onPress={onClose}
        accessibilityLabel={t("common.close")}
      >
        <MaterialIcons
          name='close'
          size={IOS_PLAYER.barIconSize}
          color='white'
        />
      </BarButton>

      <View
        pointerEvents='none'
        style={{ paddingLeft: 8, flexShrink: 1, gap: 2 }}
      >
        {item.Name ? (
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={{
              color: "white",
              fontSize: 15,
              lineHeight: 20,
              fontWeight: "600",
            }}
          >
            {item.Name}
          </Text>
        ) : null}
        {subtitle ? (
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 12,
              lineHeight: 16,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View pointerEvents='none' style={{ flexGrow: 1, minWidth: 12 }} />

      {startPictureInPicture && (
        <BarButton size={size} onPress={startPictureInPicture}>
          <MaterialIcons
            name='picture-in-picture-alt'
            size={IOS_PLAYER.barIconSize}
            color='white'
          />
        </BarButton>
      )}

      {!compact && onZoomToggle && (
        <BarButton
          size={size}
          onPress={onZoomToggle}
          accessibilityLabel={t("player.zoom_to_fill")}
        >
          <MaterialIcons
            name={isZoomedToFill ? "close-fullscreen" : "open-in-full"}
            size={IOS_PLAYER.barIconSize - 2}
            color='white'
          />
        </BarButton>
      )}

      {onShowEpisodes && (
        <BarButton
          size={size}
          onPress={onShowEpisodes}
          accessibilityLabel={t("common.episodes")}
        >
          <MaterialIcons
            name='format-list-bulleted'
            size={IOS_PLAYER.barIconSize}
            color='white'
          />
        </BarButton>
      )}

      {!compact && menus.speed.length > 0 && (
        <BarMenu
          size={size}
          groups={menus.speed}
          title={t("player.menu.speed")}
          onTouch={onMenuTouch}
          icon={
            <MaterialIcons
              name='speed'
              size={IOS_PLAYER.barIconSize}
              color='white'
            />
          }
        />
      )}

      {showTrackMenus && menus.audio.length > 0 && (
        <BarMenu
          size={size}
          groups={menus.audio}
          title={t("player.menu.audio")}
          onTouch={onMenuTouch}
          icon={
            <MaterialCommunityIcons
              name='waveform'
              size={IOS_PLAYER.barIconSize}
              color='white'
            />
          }
        />
      )}

      {showTrackMenus && menus.subtitles.length > 0 && (
        <BarMenu
          size={size}
          groups={menus.subtitles}
          title={t("player.menu.subtitles")}
          onTouch={onMenuTouch}
          icon={
            <MaterialCommunityIcons
              name='message-text-outline'
              size={IOS_PLAYER.barIconSize}
              color='white'
            />
          }
        />
      )}

      <BarMenu
        size={size}
        groups={menus.more}
        title={t("player.menu.playback_options")}
        onTouch={onMenuTouch}
        icon={
          <MaterialCommunityIcons
            name='dots-horizontal-circle-outline'
            size={IOS_PLAYER.barIconSize}
            color='white'
          />
        }
      />
    </View>
  );
};

const BarButton: FC<{
  size: number;
  onPress: () => void;
  accessibilityLabel?: string;
  children: ReactNode;
}> = ({ size, onPress, accessibilityLabel, children }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.5}
    accessibilityRole='button'
    accessibilityLabel={accessibilityLabel}
    style={{
      width: size,
      height: size,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </TouchableOpacity>
);

const BarMenu: FC<{
  size: number;
  groups: OptionGroup[];
  title: string;
  icon: ReactNode;
  onTouch: () => void;
}> = ({ size, groups, title, icon, onTouch }) => {
  // PlatformDropdown compares its trigger by reference.
  const trigger = useMemo(
    () => (
      <View
        accessibilityRole='button'
        accessibilityLabel={title}
        style={{
          width: size,
          height: size,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </View>
    ),
    [size, title, icon],
  );
  return (
    <View onTouchStart={onTouch}>
      <PlatformDropdown title={title} groups={groups} trigger={trigger} />
    </View>
  );
};
