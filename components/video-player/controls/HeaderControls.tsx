import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { type FC, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import { useHaptic } from "@/hooks/useHaptic";
import { useOrientation } from "@/hooks/useOrientation";
import { OrientationLock } from "@/packages/expo-screen-orientation";
import { HEADER_LAYOUT } from "./constants";
import DropdownView from "./dropdown/DropdownView";
import { GlassSquare } from "./GlassSquare";
import { PlaybackSpeedScope } from "./utils/playback-speed-settings";
import { type AspectRatio } from "./VideoScalingModeSelector";
import { ZoomToggle } from "./ZoomToggle";

interface HeaderControlsProps {
  item: BaseItemDto;
  showControls: boolean;
  offline: boolean;
  mediaSource?: MediaSourceInfo | null;
  startPictureInPicture?: () => Promise<unknown>;
  switchOnEpisodeMode: () => void;
  goToPreviousItem: () => void;
  goToNextItem: (options: { isAutoPlay?: boolean }) => void;
  previousItem?: BaseItemDto | null;
  nextItem?: BaseItemDto | null;
  aspectRatio?: AspectRatio;
  isZoomedToFill?: boolean;
  onZoomToggle?: () => void;
  // Playback speed props
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  // Technical info props
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
}

export const HeaderControls: FC<HeaderControlsProps> = ({
  item,
  showControls,
  offline,
  mediaSource,
  startPictureInPicture,
  switchOnEpisodeMode,
  goToPreviousItem,
  goToNextItem,
  previousItem,
  nextItem,
  aspectRatio: _aspectRatio = "default",
  isZoomedToFill = false,
  onZoomToggle,
  playbackSpeed = 1.0,
  setPlaybackSpeed,
  showTechnicalInfo = false,
  onToggleTechnicalInfo,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useControlsSafeAreaInsets();
  const lightHapticFeedback = useHaptic("light");
  const { orientation, lockOrientation } = useOrientation();
  const [isTogglingOrientation, setIsTogglingOrientation] = useState(false);

  const onClose = async () => {
    lightHapticFeedback();
    router.back();
  };

  const toggleOrientation = useCallback(async () => {
    if (isTogglingOrientation) return;

    setIsTogglingOrientation(true);
    lightHapticFeedback();

    try {
      const isPortrait =
        orientation === OrientationLock.PORTRAIT_UP ||
        orientation === OrientationLock.PORTRAIT_DOWN;

      await lockOrientation(
        isPortrait ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP,
      );
    } finally {
      setIsTogglingOrientation(false);
    }
  }, [
    orientation,
    lockOrientation,
    isTogglingOrientation,
    lightHapticFeedback,
  ]);

  return (
    <View
      style={[
        {
          position: "absolute",
          top: insets.top,
          left: insets.left,
          right: insets.right,
          padding: HEADER_LAYOUT.CONTAINER_PADDING,
        },
      ]}
      pointerEvents={showControls ? "auto" : "none"}
      className='flex flex-row justify-between'
    >
      <View
        className='mr-auto flex flex-row items-center'
        style={{ gap: 8 }}
        pointerEvents='box-none'
      >
        <GlassSquare onPress={onClose} accessibilityLabel={t("common.close")}>
          <Ionicons name='close' size={22} color={NeonBoard.text} />
        </GlassSquare>
        {!Platform.isTV && (!offline || !mediaSource?.TranscodingUrl) && (
          <View pointerEvents='auto'>
            <DropdownView
              playbackSpeed={playbackSpeed}
              setPlaybackSpeed={setPlaybackSpeed}
              showTechnicalInfo={showTechnicalInfo}
              onToggleTechnicalInfo={onToggleTechnicalInfo}
            />
          </View>
        )}
      </View>

      <View className='flex flex-row items-center' style={{ gap: 8 }}>
        {/* Rotate toggle is Android-only: iOS does not reliably rotate the
            player back to portrait programmatically. */}
        {Platform.OS === "android" && (
          <GlassSquare
            onPress={toggleOrientation}
            disabled={isTogglingOrientation}
            accessibilityLabel={t("accessibility.toggle_orientation")}
            accessibilityHint={t("accessibility.toggle_orientation_hint")}
          >
            <MaterialIcons
              name='screen-rotation'
              size={20}
              color={NeonBoard.text}
            />
          </GlassSquare>
        )}
        {!Platform.isTV && startPictureInPicture && (
          <GlassSquare onPress={startPictureInPicture}>
            <MaterialIcons
              name='picture-in-picture'
              size={20}
              color={NeonBoard.text}
            />
          </GlassSquare>
        )}
        {item?.Type === "Episode" && (
          <GlassSquare onPress={switchOnEpisodeMode}>
            <Ionicons name='list' size={20} color={NeonBoard.text} />
          </GlassSquare>
        )}
        {previousItem && (
          <GlassSquare onPress={goToPreviousItem}>
            <Ionicons name='play-skip-back' size={20} color={NeonBoard.text} />
          </GlassSquare>
        )}
        {nextItem && (
          <GlassSquare onPress={() => goToNextItem({ isAutoPlay: false })}>
            <Ionicons
              name='play-skip-forward'
              size={20}
              color={NeonBoard.text}
            />
          </GlassSquare>
        )}
        {/* MPV Zoom Toggle */}
        <ZoomToggle
          isZoomedToFill={isZoomedToFill}
          onToggle={onZoomToggle ?? (() => {})}
          disabled={!onZoomToggle}
        />
      </View>
    </View>
  );
};
