import { Ionicons } from "@expo/vector-icons";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { NeonBoard, typeAccent } from "@/constants/Colors";
import { glowButton, Sizes } from "@/constants/neon";
import { useHaptic } from "@/hooks/useHaptic";
import type { ThemeColors } from "@/hooks/useImageColorsReturn";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { formatDuration, runtimeTicksToMinutes } from "@/utils/time";
import { Button } from "./Button";
import { Text } from "./common/Text";
import type { SelectedOptions } from "./ItemContent";

interface Props extends React.ComponentProps<typeof TouchableOpacity> {
  item: BaseItemDto;
  selectedOptions: SelectedOptions;
  /**
   * Artwork-derived colours. Kept for call-site compatibility; the pill is
   * prismatic now and no longer tints itself from the poster.
   */
  colors?: ThemeColors;
}

const ANIMATION_DURATION = 500;
const MIN_PLAYBACK_WIDTH = 15;

export const PlayButton: React.FC<Props> = ({
  item,
  selectedOptions,
}: Props) => {
  const isOffline = useOfflineMode();
  const { t } = useTranslation();
  const { showModal, hideModal } = useGlobalModal();

  const startWidth = useSharedValue(0);
  const targetWidth = useSharedValue(0);
  const widthProgress = useSharedValue(0);
  const [pillWidth, setPillWidth] = useState(0);
  const { settings } = useSettings();
  const lightHapticFeedback = useHaptic("light");
  const playMedia = usePlayMedia();

  const handleNormalPlayFlow = useCallback(
    async (positionTicks: number) => {
      if (!item) return;

      const playRequest: PlayRequest = {
        itemId: item.Id!,
        audioIndex: selectedOptions.audioIndex,
        subtitleIndex: selectedOptions.subtitleIndex,
        mediaSourceId: selectedOptions.mediaSource?.Id ?? undefined,
        bitrateValue: selectedOptions.bitrate?.value,
        offline: isOffline,
        playbackPositionTicks: positionTicks,
      };

      await playMedia(playRequest, { item });
    },
    [item, selectedOptions, playMedia, isOffline],
  );

  const startPlayback = useCallback(
    async (positionTicks: number) => {
      if (!item) return;

      // Check if item is downloaded
      const downloadedItem = item.Id
        ? getDownloadedItemById(item.Id)
        : undefined;

      // If already in offline mode, play downloaded file directly
      if (isOffline && downloadedItem) {
        await playMedia(
          {
            itemId: item.Id!,
            offline: true,
            playbackPositionTicks: positionTicks,
          },
          { item },
        );
        return;
      }

      // If online but file is downloaded, ask user which version to play
      if (downloadedItem) {
        if (Platform.OS === "android") {
          // Show bottom sheet for Android
          showModal(
            <BottomSheetView>
              <View className='px-4 mt-4 mb-12'>
                <View className='pb-6'>
                  <Text className='text-2xl font-bold mb-2'>
                    {t("player.downloaded_file_title")}
                  </Text>
                  <Text className='opacity-70 text-base'>
                    {t("player.downloaded_file_message")}
                  </Text>
                </View>
                <View className='space-y-3'>
                  <Button
                    onPress={() => {
                      hideModal();
                      void playMedia(
                        {
                          itemId: item.Id!,
                          offline: true,
                          playbackPositionTicks: positionTicks,
                        },
                        { item },
                      );
                    }}
                    color='primary'
                  >
                    {Platform.OS === "android"
                      ? "Play downloaded file"
                      : t("player.downloaded_file_yes")}
                  </Button>
                  <Button
                    onPress={() => {
                      hideModal();
                      handleNormalPlayFlow(positionTicks);
                    }}
                    color='white'
                    variant='border'
                  >
                    {Platform.OS === "android"
                      ? "Stream file"
                      : t("player.downloaded_file_no")}
                  </Button>
                </View>
              </View>
            </BottomSheetView>,
            {
              snapPoints: ["35%"],
              enablePanDownToClose: true,
            },
          );
        } else {
          // Show alert for iOS
          Alert.alert(
            t("player.downloaded_file_title"),
            t("player.downloaded_file_message"),
            [
              {
                text: t("player.downloaded_file_yes"),
                onPress: () => {
                  void playMedia(
                    {
                      itemId: item.Id!,
                      offline: true,
                      playbackPositionTicks: positionTicks,
                    },
                    { item },
                  );
                },
                isPreferred: true,
              },
              {
                text: t("player.downloaded_file_no"),
                onPress: () => {
                  handleNormalPlayFlow(positionTicks);
                },
              },
              {
                text: t("player.downloaded_file_cancel"),
                style: "cancel",
              },
            ],
          );
        }
        return;
      }

      // If not downloaded, proceed with normal flow
      handleNormalPlayFlow(positionTicks);
    },
    [item, isOffline, handleNormalPlayFlow, playMedia, t, showModal, hideModal],
  );

  const onPress = useCallback(() => {
    if (!item) return;

    lightHapticFeedback();

    // Same prompt the TV item page shows: an in-progress item asks whether
    // to resume or restart instead of silently resuming. Users can turn the
    // prompt off in settings, in which case playback resumes right away.
    const progressTicks = item.UserData?.PlaybackPositionTicks ?? 0;
    if (progressTicks > 0 && !settings.showResumeDialog) {
      void startPlayback(progressTicks);
      return;
    }
    if (progressTicks > 0) {
      Alert.alert(
        t("item_card.resume_playback"),
        t("item_card.resume_playback_description"),
        [
          {
            text: t("common.cancel"),
            style: "cancel",
          },
          {
            text: t("item_card.play_from_start"),
            onPress: () => void startPlayback(0),
          },
          {
            text: t("item_card.continue_from", {
              time: formatDuration(progressTicks),
            }),
            onPress: () => void startPlayback(progressTicks),
            isPreferred: true,
          },
        ],
      );
      return;
    }

    void startPlayback(0);
  }, [item, lightHapticFeedback, startPlayback, t, settings.showResumeDialog]);

  const derivedTargetWidth = useDerivedValue(() => {
    if (!item?.RunTimeTicks) return 0;
    const userData = item.UserData;
    if (userData?.PlaybackPositionTicks) {
      return userData.PlaybackPositionTicks > 0
        ? Math.max(
            (userData.PlaybackPositionTicks / item.RunTimeTicks) * 100,
            MIN_PLAYBACK_WIDTH,
          )
        : 0;
    }
    return 0;
  }, [item]);

  useAnimatedReaction(
    () => derivedTargetWidth.value,
    (newWidth) => {
      targetWidth.value = newWidth;
      widthProgress.value = 0;
      widthProgress.value = withTiming(1, {
        duration: ANIMATION_DURATION,
        easing: Easing.bezier(0.7, 0, 0.3, 1.0),
      });
    },
    [item],
  );

  useEffect(() => {
    const settle = setTimeout(() => {
      startWidth.value = targetWidth.value;
    }, ANIMATION_DURATION);

    return () => {
      clearTimeout(settle);
    };
  }, [item]);

  const animatedWidthStyle = useAnimatedStyle(() => ({
    width: `${interpolate(
      widthProgress.value,
      [0, 1],
      [startWidth.value, targetWidth.value],
    )}%`,
  }));

  const accent = typeAccent(item);
  const positionTicks = item?.UserData?.PlaybackPositionTicks || 0;
  const remaining = runtimeTicksToMinutes(
    (item?.RunTimeTicks || 0) - positionTicks,
  );
  const label =
    positionTicks > 0
      ? t("item.resume_left", { time: remaining })
      : t("item.play_runtime", { time: remaining });

  return (
    <TouchableOpacity
      disabled={!item}
      accessibilityLabel={t("accessibility.play_button")}
      accessibilityHint={t("accessibility.play_hint")}
      onPress={onPress}
      activeOpacity={0.85}
      className='relative flex-1'
      onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}
      style={[
        {
          height: Sizes.button,
          backgroundColor: accent,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        glowButton(accent),
      ]}
    >
      {/* Watched progress: a darker run from the left edge. */}
      {pillWidth > 0 && (
        <Animated.View
          style={[
            animatedWidthStyle,
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: "rgba(5,6,8,0.18)",
            },
          ]}
        />
      )}
      <View className='flex flex-row items-center' style={{ gap: 10 }}>
        <Ionicons name='play' size={18} color={NeonBoard.onAccent} />
        <Text
          variant='button'
          allowFontScaling={false}
          numberOfLines={1}
          style={{ color: NeonBoard.onAccent }}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};
