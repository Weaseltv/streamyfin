import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { Scrims } from "@/constants/neon";
import { usePlayerAccent } from "@/utils/atoms/pageAccent";

interface NextEpisodeCountDownButtonProps extends TouchableOpacityProps {
  onFinish?: () => void;
  onPress?: () => void;
  show: boolean;
}

const NextEpisodeCountDownButton: React.FC<NextEpisodeCountDownButtonProps> = ({
  onFinish,
  onPress,
  show,
  ...props
}) => {
  const progress = useSharedValue(0);
  const accent = usePlayerAccent();

  useEffect(() => {
    if (show) {
      progress.value = 0;
      progress.value = withTiming(
        1,
        {
          duration: 10000, // 10 seconds
          easing: Easing.linear,
        },
        (finished) => {
          if (finished && onFinish) {
            runOnJS(onFinish)();
          }
        },
      );

      // Cancel animation on unmount to prevent onFinish from firing after exit
      return () => {
        cancelAnimation(progress);
      };
    }
  }, [show, onFinish]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      left: 0,
      bottom: 0,
      height: 3,
      width: `${progress.value * 100}%`,
      backgroundColor: accent,
    };
  });

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  const { t } = useTranslation();

  if (!show) {
    return null;
  }

  return (
    <TouchableOpacity
      style={{
        minWidth: 128,
        height: 40,
        overflow: "hidden",
        backgroundColor: Scrims.glass,
        borderWidth: 1,
        borderColor: accent,
        justifyContent: "center",
        paddingHorizontal: 14,
      }}
      {...props}
      onPress={handlePress}
    >
      <Text
        variant='button'
        allowFontScaling={false}
        numberOfLines={1}
        accent={accent}
        style={{ textAlign: "center" }}
      >
        {t("player.next_episode")}
      </Text>
      <Animated.View style={animatedStyle} />
    </TouchableOpacity>
  );
};

export default NextEpisodeCountDownButton;
