import { Feather } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { type StyleProp, View, type ViewStyle } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowChip } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { Text } from "./Text";

interface Props {
  /** Feather glyph in the icon box. */
  icon: keyof typeof Feather.glyphMap;
  title: string;
  /** One line of 13 `mid` detail. */
  detail?: string | null;
  /** Box border and glyph colour; the page accent. Defaults to volt. */
  accent?: string;
  /** Optional action under the detail (states that need one; empty has none). */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The P15 empty state: a 72 accent-bordered icon box with a glow, Condensed
 * 22 title, one line of 13 `mid` detail and no button.
 */
export const EmptyState: React.FC<Props> = ({
  icon,
  title,
  detail,
  accent: accentProp,
  action,
  style,
}) => {
  const accent = useAccent(accentProp);
  return (
    <View
      style={[
        { alignItems: "center", paddingHorizontal: 32, paddingVertical: 56 },
        style,
      ]}
    >
      <View
        style={[
          {
            width: 72,
            height: 72,
            borderWidth: 1,
            borderColor: accent,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: NeonBoard.stage,
          },
          glowChip(accent),
        ]}
      >
        <Feather name={icon} size={30} color={accent} />
      </View>
      <Text
        variant='pageTitle'
        style={{
          fontSize: 22,
          lineHeight: 24,
          marginTop: 22,
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {detail ? (
        <Text
          variant='body'
          muted
          style={{
            fontSize: 13,
            lineHeight: 18,
            marginTop: 10,
            textAlign: "center",
          }}
        >
          {detail}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 20 }}>{action}</View> : null}
    </View>
  );
};
