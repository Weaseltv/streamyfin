import { LinearGradient } from "expo-linear-gradient";
import type React from "react";
import { Text } from "@/components/common/Text";
import { Colors, Gradients } from "@/constants/Colors";

interface Props {
  count?: number | null;
  /** Which gradient the badge wears. Movies read cool, series read warm. */
  variant?: "movies" | "series";
  size?: number;
}

/** The small gradient-filled count disc used on the downloads screen. */
export const CountBadge: React.FC<Props> = ({
  count,
  variant = "movies",
  size = 24,
}) => (
  <LinearGradient
    colors={
      (variant === "series"
        ? Gradients.badgeSeries
        : Gradients.badgeMovies) as unknown as [string, string, ...string[]]
    }
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={{
      height: size,
      width: size,
      borderRadius: size / 2,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <Text className='text-xs font-bold' style={{ color: Colors.background }}>
      {count}
    </Text>
  </LinearGradient>
);
