import { BlurView } from "expo-blur";
import { Platform, View, type ViewProps } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowChip, Sizes } from "@/constants/neon";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { Text } from "./common/Text";

interface Props extends ViewProps {
  text?: string | number | null;
  /**
   * `primary` and `filled` are the filled badge (`onAccent` text, used for
   * Available / Approved); `gray` and `outline` the 1pt accent hairline on the
   * stage. Defaults to the hairline.
   */
  variant?: "gray" | "primary" | "outline" | "filled";
  /** Hex accent: the item's type colour or a status colour. Defaults to `mid`. */
  tint?: string;
  /** Neon glow on the badge (type badges on cards carry one). */
  glow?: boolean;
  iconLeft?: React.ReactNode;
}

/** 18 high, 9/700 upper, 1pt accent border on `stage`; filled variant for Available / Approved. */
export const Badge: React.FC<Props> = ({
  iconLeft,
  text,
  variant = "outline",
  tint,
  glow = false,
  ...props
}) => {
  const typography = useScaledTVTypography();

  // On TV, use BlurView for consistent styling
  if (Platform.isTV) {
    return (
      <BlurView
        intensity={10}
        tint='light'
        style={{
          borderRadius: 8,
          overflow: "hidden",
          alignSelf: "flex-start",
          flexShrink: 1,
          flexGrow: 0,
        }}
      >
        <View
          style={[
            {
              paddingVertical: 10,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.3)",
            },
            props.style,
          ]}
        >
          {iconLeft && <View style={{ marginRight: 8 }}>{iconLeft}</View>}
          <Text
            style={{
              fontSize: typography.callout,
              color: "#E5E7EB",
            }}
          >
            {text}
          </Text>
        </View>
      </BlurView>
    );
  }

  const accent = tint ?? NeonBoard.mid;
  const filled = variant === "primary" || variant === "filled";

  return (
    <View
      {...props}
      style={[
        {
          height: Sizes.badge,
          paddingHorizontal: 6,
          flexShrink: 1,
          flexGrow: 0,
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: filled ? accent : NeonBoard.stage,
          borderWidth: 1,
          borderColor: accent,
        },
        glow ? glowChip(accent) : null,
        props.style,
      ]}
    >
      {iconLeft && <View style={{ marginRight: 4 }}>{iconLeft}</View>}
      <Text
        variant='badge'
        allowFontScaling={false}
        numberOfLines={1}
        style={{ color: filled ? NeonBoard.onAccent : accent }}
      >
        {text}
      </Text>
    </View>
  );
};
