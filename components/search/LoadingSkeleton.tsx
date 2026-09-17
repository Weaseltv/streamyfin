import { View } from "react-native";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { RailSkeleton } from "@/components/home/RailSkeleton";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";

interface Props {
  isLoading: boolean;
}

/** Three section-shaped `card2` blocks in place of the result rails while a search runs. */
export const LoadingSkeleton: React.FC<Props> = ({ isLoading }) => {
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  useAnimatedReaction(
    () => isLoading,
    (loading) => {
      if (loading) {
        opacity.value = withTiming(1, { duration: 200 });
      } else {
        opacity.value = withTiming(0, { duration: 200 });
      }
    },
  );

  return (
    <Animated.View
      pointerEvents='none'
      style={[animatedStyle, { position: "absolute", width: "100%" }]}
    >
      {[1, 2, 3].map((s) => (
        <View key={s} style={{ marginBottom: 16 }}>
          <View
            style={{
              marginHorizontal: Sizes.gutter,
              marginTop: 10,
              marginBottom: 12,
              paddingBottom: 6,
              borderBottomWidth: 1,
              borderBottomColor: NeonBoard.line,
            }}
          >
            <View
              style={{
                width: 120,
                height: 16,
                backgroundColor: NeonBoard.card2,
              }}
            />
          </View>
          <RailSkeleton orientation={s === 3 ? "horizontal" : "vertical"} />
        </View>
      ))}
    </Animated.View>
  );
};
