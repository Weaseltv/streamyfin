import { View } from "react-native";
import { railCardWidth } from "@/components/home/ItemCard";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";

/** `card2` blocks with radius 0 in the shape of three cards. */
export const RailSkeleton: React.FC<{
  orientation: "horizontal" | "vertical";
}> = ({ orientation }) => {
  const w = railCardWidth(orientation);
  const h = orientation === "horizontal" ? Sizes.thumb.h : Sizes.poster.h;
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: Sizes.gutter,
      }}
    >
      {[1, 2, 3].map((i) => (
        <View key={i} style={{ width: w }}>
          <View
            style={{ width: w, height: h, backgroundColor: NeonBoard.card2 }}
          />
          <View
            style={{
              width: w * 0.8,
              height: 12,
              marginTop: 8,
              backgroundColor: NeonBoard.card2,
            }}
          />
          <View
            style={{
              width: w * 0.5,
              height: 10,
              marginTop: 6,
              backgroundColor: NeonBoard.card2,
            }}
          />
        </View>
      ))}
    </View>
  );
};
