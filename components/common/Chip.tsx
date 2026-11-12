import { Feather } from "@expo/vector-icons";
import type { PropsWithChildren, ReactNode } from "react";
import {
  type StyleProp,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { chipOn, Sizes } from "@/constants/neon";
import { useAccent } from "@/utils/atoms/pageAccent";
import { Text } from "./Text";

interface Props {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  /** Accent for the selected border and fill. Defaults to the page accent. */
  accent?: string;
  /**
   * Border and label colour at rest, for buttons that always wear their
   * colour (ALL / MOVIES / SHOWS in volt / cyan / red). Defaults to `line2`
   * border and `text` label.
   */
  tone?: string;
  /** Optional 14 glyph before the label. */
  icon?: ReactNode;
  /** Show a caret after the label (pickers). */
  caret?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A 36 outline chip, as the TV's filter and quick-list buttons: transparent,
 * 1pt `line2` border, Exo 2 700 uppercase label; selected = 2pt accent border
 * on the accent-tinted fill.
 */
export const Chip: React.FC<PropsWithChildren<Props>> = ({
  label,
  selected = false,
  disabled = false,
  accent: accentProp,
  tone,
  icon,
  caret = false,
  onPress,
  style,
}) => {
  const accent = useAccent(accentProp);
  const color = tone ?? NeonBoard.text;
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
          paddingHorizontal: selected ? 10 : 11,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: selected ? chipOn(accent) : "transparent",
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? accent : (tone ?? NeonBoard.line2),
          opacity: disabled ? 0.5 : 1,
        },
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
      {caret ? <Feather name='chevron-down' size={14} color={color} /> : null}
    </TouchableOpacity>
  );
};
