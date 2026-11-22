import { MaterialIcons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps, FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import { AndroidCenterControls } from "./AndroidCenterControls";
import { AndroidBrightnessPill, AndroidVolumePill } from "./AndroidSideSliders";
import { AndroidTopBar } from "./AndroidTopBar";
import { FadeView } from "./FadeView";
import { IOS_PLAYER } from "./layout";
import type { AndroidPlayerMenus } from "./useAndroidPlayerMenus";

type CenterProps = Omit<
  ComponentProps<typeof AndroidCenterControls>,
  "availableWidth"
>;

interface Props {
  item: BaseItemDto;
  showControls: boolean;
  menus: AndroidPlayerMenus;
  showTrackMenus: boolean;
  onClose: () => void;
  startPictureInPicture?: () => void;
  isZoomedToFill: boolean;
  onZoomToggle?: () => void;
  onShowEpisodes?: () => void;
  onMenuTouch: () => void;
  center: CenterProps;
  bottomBar: ReactNode;
  isBuffering: boolean;
  isSliding: boolean;
  showVolumeSlider: boolean;
  showBrightnessSlider: boolean;
  volumeRevealed: boolean;
  brightnessRevealed: boolean;
  onVolumeExternalChange: () => void;
  onSliderEditing: (editing: boolean) => void;
  locked: boolean;
  unlockRevealed: boolean;
  onUnlock: () => void;
}

const SCRIM = `rgba(0,0,0,${IOS_PLAYER.scrimOpacity})`;

/**
 * The Android phone player chrome in the iPhone's layout
 * (PlayerControlsRootView.swift): gradient scrims, the top bar, the centre
 * transport row at the middle of the safe area, the bottom bar, the edge
 * sliders, the buffering spinner and the lock-mode Unlock pill.
 */
export const AndroidPlayerChrome: FC<Props> = ({
  item,
  showControls,
  menus,
  showTrackMenus,
  onClose,
  startPictureInPicture,
  isZoomedToFill,
  onZoomToggle,
  onShowEpisodes,
  onMenuTouch,
  center,
  bottomBar,
  isBuffering,
  isSliding,
  showVolumeSlider,
  showBrightnessSlider,
  volumeRevealed,
  brightnessRevealed,
  onVolumeExternalChange,
  onSliderEditing,
  locked,
  unlockRevealed,
  onUnlock,
}) => {
  const { t } = useTranslation();
  const insets = useControlsSafeAreaInsets();
  const { width } = useWindowDimensions();
  const safeWidth = width - insets.left - insets.right;
  const compact = safeWidth < IOS_PLAYER.compactWidth;
  const anySlider = showVolumeSlider || showBrightnessSlider;
  const centerPadding = anySlider
    ? IOS_PLAYER.centerPaddingWithSliders
    : IOS_PLAYER.centerPaddingNoSliders;

  const safeArea = {
    position: "absolute" as const,
    top: insets.top,
    bottom: insets.bottom,
    left: insets.left,
    right: insets.right,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents='box-none'>
      <FadeView
        visible={showControls}
        style={StyleSheet.absoluteFill}
        pointerEvents='none'
      >
        <LinearGradient
          colors={[SCRIM, "rgba(0,0,0,0)"]}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: IOS_PLAYER.topScrimHeight,
          }}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0)", SCRIM]}
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: IOS_PLAYER.bottomScrimHeight,
          }}
        />
      </FadeView>

      {/* Centre row: true middle of the safe area, between the sliders. */}
      <FadeView
        visible={showControls}
        style={[
          safeArea,
          {
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: centerPadding,
          },
        ]}
      >
        <AndroidCenterControls
          {...center}
          availableWidth={safeWidth - centerPadding * 2}
        />
      </FadeView>

      {isBuffering && !isSliding && (
        <View
          style={[safeArea, { alignItems: "center", justifyContent: "center" }]}
          pointerEvents='none'
        >
          <ActivityIndicator size='large' color='white' />
        </View>
      )}

      {/* Edge sliders: brightness left, volume right. */}
      <View
        style={[
          safeArea,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: IOS_PLAYER.sliderInset,
          },
        ]}
        pointerEvents='box-none'
      >
        {showBrightnessSlider ? (
          <FadeView visible={showControls || brightnessRevealed}>
            <AndroidBrightnessPill onEditingChanged={onSliderEditing} />
          </FadeView>
        ) : (
          <View />
        )}
        {showVolumeSlider ? (
          <FadeView visible={showControls || volumeRevealed}>
            <AndroidVolumePill
              onEditingChanged={onSliderEditing}
              onExternalChange={onVolumeExternalChange}
            />
          </FadeView>
        ) : (
          <View />
        )}
      </View>

      {/* Bars above the centre row, so the trickplay bubble covers it. */}
      <FadeView
        visible={showControls}
        style={[
          safeArea,
          {
            paddingHorizontal: IOS_PLAYER.edgePadding,
            paddingVertical: IOS_PLAYER.verticalPadding,
            justifyContent: "space-between",
          },
        ]}
      >
        <View pointerEvents='box-none'>
          <AndroidTopBar
            item={item}
            compact={compact}
            menus={menus}
            showTrackMenus={showTrackMenus}
            onClose={onClose}
            startPictureInPicture={startPictureInPicture}
            isZoomedToFill={isZoomedToFill}
            onZoomToggle={onZoomToggle}
            onShowEpisodes={onShowEpisodes}
            onMenuTouch={onMenuTouch}
          />
        </View>
        <View
          pointerEvents='box-none'
          style={{ paddingBottom: IOS_PLAYER.bottomBarPadding }}
        >
          {bottomBar}
        </View>
      </FadeView>

      <FadeView
        visible={locked && unlockRevealed}
        style={{
          position: "absolute",
          top: insets.top + 24,
          left: 0,
          right: 0,
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={onUnlock}
          activeOpacity={0.6}
          accessibilityRole='button'
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 999,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        >
          <MaterialIcons name='lock-open' size={16} color='white' />
          <Text
            allowFontScaling={false}
            style={{
              color: "white",
              fontSize: 13,
              lineHeight: 16,
              fontWeight: "600",
            }}
          >
            {t("player.unlock")}
          </Text>
        </TouchableOpacity>
      </FadeView>
    </View>
  );
};
