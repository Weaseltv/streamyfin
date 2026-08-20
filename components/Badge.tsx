import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { Colors } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { GlassSurface } from "./common/GlassSurface";
import { Text } from "./common/Text";

interface Props extends ViewProps {
  text?: string | number | null;
  variant?: "gray" | "primary";
  /**
   * Neon hue for a media badge (4K, Dolby Vision, audio format). When set the
   * badge draws a 1px hairline and matching text in that hue instead of a fill.
   */
  tint?: string;
  iconLeft?: React.ReactNode;
}

export const Badge: React.FC<Props> = ({
  iconLeft,
  text,
  variant = "primary",
  tint,
  ...props
}) => {
  const typography = useScaledTVTypography();

  const content = (
    <View style={styles.content}>
      {iconLeft && <View style={styles.iconLeft}>{iconLeft}</View>}
      <Text className='text-xs' style={tint ? { color: tint } : undefined}>
        {text}
      </Text>
    </View>
  );

  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <View {...props} style={[styles.container, props.style]}>
        <GlassSurface
          style={[
            { borderRadius: 100 },
            tint ? { borderWidth: 1, borderColor: tint } : null,
          ]}
        >
          {content}
        </GlassSurface>
      </View>
    );
  }

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

  return (
    <View
      {...props}
      style={[
        {
          borderRadius: 4,
          padding: 4,
          paddingHorizontal: 6,
          flexShrink: 1,
          flexGrow: 0,
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: tint
            ? "transparent"
            : variant === "primary"
              ? Colors.primary
              : "#262626",
          borderWidth: tint ? 1 : 0,
          borderColor: tint ?? "transparent",
        },
        props.style,
      ]}
    >
      {iconLeft && <View style={{ marginRight: 4 }}>{iconLeft}</View>}
      <Text
        style={{
          fontSize: 12,
          color: tint ?? (variant === "primary" ? Colors.background : "#fff"),
        }}
      >
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    alignSelf: "flex-start",
    flexShrink: 1,
    flexGrow: 0,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 50,
    backgroundColor: "transparent",
  },
  iconLeft: {
    marginRight: 4,
  },
});
