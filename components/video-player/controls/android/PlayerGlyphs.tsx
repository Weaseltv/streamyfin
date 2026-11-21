import { MaterialIcons } from "@expo/vector-icons";
import type { FC } from "react";
import { Text, View } from "react-native";

/**
 * SF Symbols only ship numbered seek glyphs for some intervals; Material
 * ships replay/forward 5, 10 and 30. Any other interval draws the plain
 * circular arrow with the number set inside it, the way the Material glyphs
 * do.
 */
const NUMBERED = new Set([5, 10, 30]);

export const SeekGlyph: FC<{
  forward: boolean;
  seconds: number;
  size: number;
  color?: string;
}> = ({ forward, seconds, size, color = "white" }) => {
  const rounded = Math.round(seconds);
  if (NUMBERED.has(rounded)) {
    return (
      <MaterialIcons
        name={`${forward ? "forward" : "replay"}-${rounded}` as "replay-10"}
        size={size}
        color={color}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <MaterialIcons
        name='replay'
        size={size}
        color={color}
        style={forward ? { transform: [{ scaleX: -1 }] } : undefined}
      />
      {Number.isFinite(rounded) && rounded > 0 && (
        <Text
          allowFontScaling={false}
          style={{
            position: "absolute",
            top: size * 0.42,
            color,
            fontSize: size * 0.24,
            fontWeight: "700",
          }}
        >
          {rounded}
        </Text>
      )}
    </View>
  );
};
