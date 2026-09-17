import { Ionicons } from "@expo/vector-icons";
import type { FC } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { NeonBoard } from "@/constants/Colors";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import { usePlayerAccent } from "@/utils/atoms/pageAccent";
import { useSettings } from "@/utils/atoms/settings";
import AudioSlider from "./AudioSlider";
import BrightnessSlider from "./BrightnessSlider";
import { GlassSquare } from "./GlassSquare";

interface CenterControlsProps {
  showControls: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  showAudioSlider: boolean;
  setShowAudioSlider: (show: boolean) => void;
  togglePlay: () => void;
  handleSkipBackward: () => void;
  handleSkipForward: () => void;
  // Chapter navigation props
  hasChapters?: boolean;
  hasPreviousChapter?: boolean;
  hasNextChapter?: boolean;
  goToPreviousChapter?: () => void;
  goToNextChapter?: () => void;
}

export const CenterControls: FC<CenterControlsProps> = ({
  showControls,
  isPlaying,
  isBuffering,
  showAudioSlider,
  setShowAudioSlider,
  togglePlay,
  handleSkipBackward,
  handleSkipForward,
  hasChapters = false,
  hasPreviousChapter = false,
  hasNextChapter = false,
  goToPreviousChapter,
  goToNextChapter,
}) => {
  const { settings } = useSettings();
  const insets = useControlsSafeAreaInsets();
  const accent = usePlayerAccent();

  return (
    <View
      style={{
        position: "absolute",
        top: "50%",
        left: insets.left,
        right: insets.right,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: hasChapters ? 16 : 28,
        transform: [{ translateY: -32 }],
      }}
      pointerEvents={showControls ? "box-none" : "none"}
    >
      {!settings?.hideBrightnessSlider && (
        <View
          style={{
            position: "absolute",
            alignItems: "center",
            transform: [{ rotate: "270deg" }],
            left: 0,
            bottom: 30,
          }}
        >
          <BrightnessSlider />
        </View>
      )}

      {!Platform.isTV && hasChapters && (
        <GlassSquare
          size={48}
          onPress={goToPreviousChapter}
          disabled={!hasPreviousChapter}
        >
          <Ionicons name='play-back' size={20} color={NeonBoard.text} />
        </GlassSquare>
      )}

      {!Platform.isTV && (
        <GlassSquare size={48} onPress={handleSkipBackward}>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Ionicons
              name='refresh-outline'
              size={30}
              color={NeonBoard.text}
              style={{ transform: [{ scaleY: -1 }, { rotate: "180deg" }] }}
            />
            <Text
              variant='timecode'
              allowFontScaling={false}
              style={{ position: "absolute", fontSize: 10, lineHeight: 12 }}
            >
              {settings?.rewindSkipTime}
            </Text>
          </View>
        </GlassSquare>
      )}

      <View style={Platform.isTV ? { flex: 1, alignItems: "center" } : {}}>
        <GlassSquare size={64} accent={accent} onPress={togglePlay}>
          {!isBuffering ? (
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={30}
              color={NeonBoard.text}
            />
          ) : (
            <Loader size={"large"} color={accent} />
          )}
        </GlassSquare>
      </View>

      {!Platform.isTV && (
        <GlassSquare size={48} onPress={handleSkipForward}>
          <View style={{ alignItems: "center", justifyContent: "center" }}>
            <Ionicons name='refresh-outline' size={30} color={NeonBoard.text} />
            <Text
              variant='timecode'
              allowFontScaling={false}
              style={{ position: "absolute", fontSize: 10, lineHeight: 12 }}
            >
              {settings?.forwardSkipTime}
            </Text>
          </View>
        </GlassSquare>
      )}

      {!Platform.isTV && hasChapters && (
        <GlassSquare
          size={48}
          onPress={goToNextChapter}
          disabled={!hasNextChapter}
        >
          <Ionicons name='play-forward' size={20} color={NeonBoard.text} />
        </GlassSquare>
      )}

      {!settings?.hideVolumeSlider && (
        <View
          style={{
            position: "absolute",
            alignItems: "center",
            transform: [{ rotate: "270deg" }],
            bottom: 30,
            right: 0,
            opacity: showAudioSlider || showControls ? 1 : 0,
          }}
        >
          <AudioSlider setVisibility={setShowAudioSlider} />
        </View>
      )}
    </View>
  );
};
