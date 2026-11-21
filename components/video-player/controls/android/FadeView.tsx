import { type FC, type ReactNode, useEffect } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { IOS_PLAYER } from "./layout";

/** SwiftUI `.transition(.opacity)` under `.easeInOut(duration: 0.2)`. */
export const FadeView: FC<{
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  /** Touch handling while shown; hidden views never take touches. */
  pointerEvents?: "box-none" | "auto" | "none";
  duration?: number;
  children?: ReactNode;
}> = ({
  visible,
  style,
  pointerEvents = "box-none",
  duration = IOS_PLAYER.fadeMs,
  children,
}) => {
  const opacity = useSharedValue(visible ? 1 : 0);
  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration,
      easing: Easing.inOut(Easing.ease),
    });
  }, [visible, duration, opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      style={[style, animatedStyle]}
      pointerEvents={visible ? pointerEvents : "none"}
    >
      {children}
    </Animated.View>
  );
};
