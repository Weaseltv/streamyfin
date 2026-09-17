import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { NeonBoard } from "@/constants/Colors";
import { glowOverline } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";

interface Props {
  accent?: string;
  /** Renders nothing when false, so callers can mount it unconditionally. */
  active?: boolean;
}

/**
 * The 2pt accent loading line that sits under the brand row while a page
 * loads. Never a spinner over content: the sweep runs on the `line2` track
 * and the content area stays on the stage.
 */
export const LoadingLine: React.FC<Props> = ({
  accent: accentProp,
  active = true,
}) => {
  const accent = useAccent(accentProp);
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = -1;
    x.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: `${x.value * 100}%` }],
  }));
  if (!active) return null;
  return (
    <View
      accessibilityRole='progressbar'
      style={{
        height: 2,
        backgroundColor: NeonBoard.line2,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          { width: "40%", height: 2, backgroundColor: accent },
          glowOverline(accent),
          style,
        ]}
      />
    </View>
  );
};
