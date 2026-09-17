import type React from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { NeonBoard } from "@/constants/Colors";
import { glowProgress, Sizes } from "@/constants/neon";

interface Props {
  style?: StyleProp<ViewStyle>;
  seekStyle: StyleProp<ViewStyle>;
  cacheXStyle: StyleProp<ViewStyle>;
  /** Fill colour: the item's type accent. */
  color?: string;
  height?: number;
}

/**
 * The player's seek track, drawn as a `renderContainer` for the slider: a 4pt
 * `line2` track, a `low` buffered run, and the played run in the type colour
 * with a glow.
 */
export const NeonSeekTrack: React.FC<Props> = ({
  style,
  seekStyle,
  cacheXStyle,
  color = NeonBoard.volt,
  height = Sizes.seek,
}) => (
  <View
    style={[
      style,
      {
        height,
        borderRadius: 0,
        backgroundColor: NeonBoard.line2,
        overflow: "visible",
      },
    ]}
  >
    <Animated.View
      style={[
        cacheXStyle,
        {
          position: "absolute",
          height: "100%",
          backgroundColor: NeonBoard.low,
        },
      ]}
    />
    <Animated.View
      style={[
        seekStyle,
        { position: "absolute", height: "100%", backgroundColor: color },
        glowProgress(color),
      ]}
    />
  </View>
);
