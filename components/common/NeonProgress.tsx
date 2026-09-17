import type React from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowProgress, Sizes } from "@/constants/neon";

interface Props {
  /** Played fraction, 0..1. Values outside the range are clamped. */
  progress: number;
  /** Buffered fraction, 0..1. Drawn behind the fill, ahead of the track. */
  buffered?: number;
  /** Fill colour: the item's type accent. */
  color?: string;
  height?: number;
  /** Neon glow under the fill (cards and the player use it). */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}

const clamp = (n: number) =>
  Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), 1);

/** A flat 3pt progress bar: `line2` track, accent fill with a glow. */
export const NeonProgress: React.FC<Props> = ({
  progress,
  buffered,
  color = NeonBoard.volt,
  height = Sizes.progress,
  glow = true,
  style,
}) => {
  const pct = clamp(progress);
  return (
    <View
      style={[
        { height, backgroundColor: NeonBoard.line2, overflow: "visible" },
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
            backgroundColor: NeonBoard.low,
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
            backgroundColor: color,
          },
          glow ? glowProgress(color) : null,
        ]}
      />
    </View>
  );
};
