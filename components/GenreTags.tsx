// GenreTags.tsx
import { BlurView } from "expo-blur";
import type React from "react";
import {
  Platform,
  type StyleProp,
  type TextStyle,
  View,
  type ViewProps,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
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
    /** Hairline and label colour. Defaults to `mid`. */
    borderTint?: string;
  } & ViewProps
> = ({ text, textClass, textStyle, borderTint, ...props }) => {
  // Hook must be called at the top level, before any conditional returns
  const typography = useScaledTVTypography();

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

  const tone = borderTint ?? NeonBoard.mid;
  return (
    <View
      style={{
        height: 18,
        paddingHorizontal: 6,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: tone,
      }}
      {...props}
    >
      <Text
        variant='badge'
        allowFontScaling={false}
        className={textClass}
        style={[{ color: tone }, textStyle]}
      >
        {text}
      </Text>
    </View>
  );
};

export const Tags: React.FC<
  TagProps & { tagProps?: ViewProps; accent?: string } & ViewProps
> = ({ tags, textClass, tagProps, accent, ...props }) => {
  if (!tags || tags.length === 0) return null;

  return (
    <View
      className={`flex flex-row flex-wrap ${props.className}`}
      style={{ gap: Platform.isTV ? 12 : 6 }}
      {...props}
    >
      {tags.map((tag, idx) => (
        <View key={idx}>
          <Tag
            key={idx}
            textClass={textClass}
            text={tag}
            borderTint={accent}
            {...tagProps}
          />
        </View>
      ))}
    </View>
  );
};

export const GenreTags: React.FC<{ genres?: string[]; accent?: string }> = ({
  genres,
  accent,
}) => {
  return (
    <View className='mt-2'>
      <Tags tags={genres} accent={accent} />
    </View>
  );
};
