import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { useState } from "react";
import { Platform, type StyleProp, View, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { Gradients, Prism } from "@/constants/Colors";

interface Props {
  style?: StyleProp<ViewStyle>;
  seekStyle: StyleProp<ViewStyle>;
  cacheXStyle: StyleProp<ViewStyle>;
  height?: number;
}

/**
 * The player's seek track, drawn as a `renderContainer` for the slider.
 *
 * The slider only lets you tint the played portion a flat colour, so the fill
 * is rebuilt here: the rainbow renders at the track's full width inside the
 * library's animated seek view, which clips it. That keeps the colours pinned
 * to the timeline instead of squashing the whole spectrum into the played part.
 */
export const SeekTrack: React.FC<Props> = ({
  style,
  seekStyle,
  cacheXStyle,
  height = Prism.progressHeightPlayer,
}) => {
  const [trackWidth, setTrackWidth] = useState(0);

  return (
    <View
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={[
        style,
        {
          height,
          borderRadius: height / 2,
          backgroundColor: Prism.progressTrack,
          overflow: "hidden",
        },
      ]}
    >
      <Animated.View
        style={[
          cacheXStyle,
          {
            position: "absolute",
            height: "100%",
            backgroundColor: Prism.progressBuffered,
          },
        ]}
      />
      <Animated.View
        style={[
          seekStyle,
          {
            position: "absolute",
            height: "100%",
            overflow: "hidden",
            ...(Platform.OS === "ios"
              ? {
                  shadowColor: Prism.playerGlow,
                  shadowRadius: 10,
                  shadowOpacity: 1,
                  shadowOffset: { width: 0, height: 0 },
                }
              : null),
          },
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
      </Animated.View>
    </View>
  );
};
