// GenreTags.tsx
import { BlurView } from "expo-blur";
import type React from "react";
import {
  Platform,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  View,
  type ViewProps,
} from "react-native";
import { Prism } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { GlassSurface } from "./common/GlassSurface";
import { Text } from "./common/Text";

interface TagProps {
  tags?: string[];
  textClass?: ViewProps["className"];
}

export const Tag: React.FC<
  {
    text: string;
    textClass?: ViewProps["className"];
    textStyle?: StyleProp<TextStyle>;
    /** Neon hairline colour. Tags rotates these so a row reads as a set. */
    borderTint?: string;
  } & ViewProps
> = ({ text, textClass, textStyle, borderTint, ...props }) => {
  // Hook must be called at the top level, before any conditional returns
  const typography = useScaledTVTypography();

  if (Platform.OS === "ios" && !Platform.isTV) {
    return (
      <View>
        <GlassSurface
          style={[
            styles.glass,
            borderTint ? { borderWidth: 1, borderColor: borderTint } : null,
          ]}
        >
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={borderTint ? { color: borderTint } : undefined}>
              {text}
            </Text>
          </View>
        </GlassSurface>
      </View>
    );
  }

  // TV-specific styling with blur background
  if (Platform.isTV) {
    return (
      <BlurView
        intensity={10}
        tint='light'
        style={{
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: "rgba(0,0,0,0.3)",
          }}
        >
          <Text style={{ fontSize: typography.callout, color: "#E5E7EB" }}>
            {text}
          </Text>
        </View>
      </BlurView>
    );
  }

  return (
    <View
      className='rounded-full px-2 py-1'
      style={{
        backgroundColor: borderTint ? "transparent" : "#262626",
        borderWidth: borderTint ? 1 : 0,
        borderColor: borderTint ?? "transparent",
      }}
      {...props}
    >
      <Text
        className={textClass}
        style={[textStyle, borderTint ? { color: borderTint } : null]}
      >
        {text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    borderRadius: 50,
  },
  glass: {
    borderRadius: 50,
  },
});

export const Tags: React.FC<
  TagProps & { tagProps?: ViewProps } & ViewProps
> = ({ tags, textClass = "text-xs", tagProps, ...props }) => {
  if (!tags || tags.length === 0) return null;

  return (
    <View
      className={`flex flex-row flex-wrap ${props.className}`}
      style={{ gap: Platform.isTV ? 12 : 4 }}
      {...props}
    >
      {tags.map((tag, idx) => (
        <View key={idx}>
          <Tag
            key={idx}
            textClass={textClass}
            text={tag}
            borderTint={
              Prism.genreChipBorders[idx % Prism.genreChipBorders.length]
            }
            {...tagProps}
          />
        </View>
      ))}
    </View>
  );
};

export const GenreTags: React.FC<{ genres?: string[] }> = ({ genres }) => {
  return (
    <View className='mt-2'>
      <Tags tags={genres} />
    </View>
  );
};
