import { Feather } from "@expo/vector-icons";
import type { PropsWithChildren, ReactNode } from "react";
import {
  type StyleProp,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowChip, Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { Text } from "./Text";

interface Props {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** Accent for the selected fill. Defaults to volt. */
  accent?: string;
  /** Optional 14 glyph before the label. */
  icon?: ReactNode;
  /** Show a caret after the label (pickers). */
  caret?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A 30 compact chip: `card2` fill, 1pt `line2`, 12/700 label; selected =
 * filled accent with `onAccent` text and a glow.
 */
export const Chip: React.FC<PropsWithChildren<Props>> = ({
  label,
  selected = false,
  disabled = false,
  accent: accentProp,
  icon,
  caret = false,
  onPress,
  style,
}) => {
  const accent = useAccent(accentProp);
  const color = selected ? NeonBoard.onAccent : NeonBoard.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.85}
      accessibilityRole='button'
      accessibilityState={{ selected, disabled }}
      style={[
        {
          height: Sizes.chip,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: selected ? accent : NeonBoard.card2,
          borderWidth: 1,
          borderColor: selected ? accent : NeonBoard.line2,
          opacity: disabled ? 0.5 : 1,
        },
        selected ? glowChip(accent) : null,
        style,
      ]}
    >
      {icon ? <View>{icon}</View> : null}
      <Text
        variant='chip'
        allowFontScaling={false}
        style={{ color }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {caret ? <Feather name='chevron-down' size={15} color={color} /> : null}
    </TouchableOpacity>
  );
};
