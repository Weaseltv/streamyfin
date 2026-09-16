import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { useState } from "react";
import { Platform, type StyleProp, View, type ViewStyle } from "react-native";
import { Gradients, Prism } from "@/constants/Colors";

interface Props {
  /** Played fraction, 0..1. Values outside the range are clamped. */
  progress: number;
  /** Buffered fraction, 0..1. Drawn behind the fill, ahead of the track. */
  buffered?: number;
  height?: number;
  /** iOS glow under the fill. The player uses this; cards do not. */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}

const clamp = (n: number) =>
  Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), 1);

/**
 * A progress bar whose fill is a slice of the full rainbow rather than a scaled
 * copy of it. The gradient is rendered at the track's full width inside a
 * clipping view, so the colours stay anchored to the track and the bar reveals
 * them left to right - 38% shows red through yellow, not a squashed rainbow.
 */
export const RainbowProgress: React.FC<Props> = ({
  progress,
  buffered,
  height = Prism.progressHeightCard,
  glow = false,
  style,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);
  const pct = clamp(progress);

  const glowStyle =
    glow && Platform.OS === "ios"
      ? {
          shadowColor: Prism.playerGlow,
          shadowRadius: 10,
          shadowOpacity: 1,
          shadowOffset: { width: 0, height: 0 },
        }
      : null;

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: Prism.progressTrack,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {buffered !== undefined && (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${clamp(buffered) * 100}%`,
            backgroundColor: Prism.progressBuffered,
          }}
        />
      )}
      <View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${pct * 100}%`,
            overflow: "hidden",
            borderRadius: height / 2,
          },
          glowStyle,
        ]}
      >
        {trackWidth > 0 && (
          <LinearGradient
            colors={
              Gradients.rainbow as unknown as [string, string, ...string[]]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: trackWidth, height: "100%" }}
          />
        )}
      </View>
    </View>
  );
};
