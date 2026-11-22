import { MaterialIcons } from "@expo/vector-icons";
import type { FC, ReactNode } from "react";
import { TouchableOpacity, View } from "react-native";
import { pickCenterRow } from "@/utils/androidPlayerChrome";
import { SeekGlyph } from "./PlayerGlyphs";

interface Props {
  /** Width the row may use (between the edge sliders). */
  availableWidth: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isEpisode: boolean;
  rewindSeconds: number;
  forwardSeconds: number;
  togglePlay: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
  hasChapters: boolean;
  hasPreviousChapter: boolean;
  hasNextChapter: boolean;
  goToPreviousChapter?: () => void;
  goToNextChapter?: () => void;
  hasPreviousEpisode: boolean;
  hasNextEpisode: boolean;
  goToPreviousEpisode: () => void;
  goToNextEpisode: () => void;
}

/**
 * The iPhone's centre transport row: previous episode (episodes), back,
 * previous chapter (chaptered items), play/pause, next chapter, forward,
 * next episode. Like SwiftUI's ViewThatFits it steps the density down until
 * the row fits, and drops the episode buttons as a last resort.
 */
export const AndroidCenterControls: FC<Props> = ({
  availableWidth,
  isPlaying,
  isBuffering,
  isEpisode,
  rewindSeconds,
  forwardSeconds,
  togglePlay,
  onSeekBackward,
  onSeekForward,
  hasChapters,
  hasPreviousChapter,
  hasNextChapter,
  goToPreviousChapter,
  goToNextChapter,
  hasPreviousEpisode,
  hasNextEpisode,
  goToPreviousEpisode,
  goToNextEpisode,
}) => {
  const m = pickCenterRow({ availableWidth, hasChapters, isEpisode });
  const showEpisodeButtons = m.showEpisodeButtons;

  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: m.spacing }}
      pointerEvents='box-none'
    >
      {showEpisodeButtons && (
        <RowButton
          size={m.sideButton}
          onPress={goToPreviousEpisode}
          disabled={!hasPreviousEpisode}
          disabledOpacity={0.35}
        >
          <MaterialIcons name='skip-previous' size={m.jumpIcon} color='white' />
        </RowButton>
      )}

      <RowButton size={m.sideButton} onPress={onSeekBackward}>
        <SeekGlyph forward={false} seconds={rewindSeconds} size={m.seekIcon} />
      </RowButton>

      {hasChapters && (
        <RowButton
          size={m.sideButton}
          onPress={goToPreviousChapter}
          disabled={!hasPreviousChapter}
          disabledOpacity={0.3}
        >
          <MaterialIcons name='fast-rewind' size={m.jumpIcon} color='white' />
        </RowButton>
      )}

      <TouchableOpacity
        onPress={togglePlay}
        activeOpacity={0.5}
        accessibilityRole='button'
        style={{
          width: m.playButton,
          height: m.playButton,
          alignItems: "center",
          justifyContent: "center",
          // iOS hides the button while the buffering spinner shows.
          opacity: isBuffering ? 0 : 1,
        }}
      >
        <MaterialIcons
          name={isPlaying ? "pause" : "play-arrow"}
          size={m.playIcon}
          color='white'
        />
      </TouchableOpacity>

      {hasChapters && (
        <RowButton
          size={m.sideButton}
          onPress={goToNextChapter}
          disabled={!hasNextChapter}
          disabledOpacity={0.3}
        >
          <MaterialIcons name='fast-forward' size={m.jumpIcon} color='white' />
        </RowButton>
      )}

      <RowButton size={m.sideButton} onPress={onSeekForward}>
        <SeekGlyph forward seconds={forwardSeconds} size={m.seekIcon} />
      </RowButton>

      {showEpisodeButtons && (
        <RowButton
          size={m.sideButton}
          onPress={goToNextEpisode}
          disabled={!hasNextEpisode}
          disabledOpacity={0.35}
        >
          <MaterialIcons name='skip-next' size={m.jumpIcon} color='white' />
        </RowButton>
      )}
    </View>
  );
};

const RowButton: FC<{
  size: number;
  onPress?: () => void;
  disabled?: boolean;
  disabledOpacity?: number;
  children: ReactNode;
}> = ({ size, onPress, disabled, disabledOpacity = 0.3, children }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.5}
    accessibilityRole='button'
    style={{
      width: size,
      height: size,
      alignItems: "center",
      justifyContent: "center",
      opacity: disabled ? disabledOpacity : 1,
    }}
  >
    {children}
  </TouchableOpacity>
);
