import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { useHaptic } from "@/hooks/useHaptic";
import { useAccent } from "@/utils/atoms/pageAccent";

interface Props {
  icon: ReactNode;
  label: string;
  onPress?: () => void;
  /** Label colour when the toggle is on. */
  active?: boolean;
  accent?: string;
  disabled?: boolean;
  /** Draw the hairline on the left (every cell after the first). */
  divider?: boolean;
}

export const ACTION_STRIP_HEIGHT = 64;

/** One cell of the item page's action strip: 18 glyph over a 9/700 label. */
export const ActionCell: React.FC<Props> = ({
  icon,
  label,
  onPress,
  active,
  accent: accentProp,
  disabled,
  divider,
}) => {
  const accent = useAccent(accentProp);
  const haptic = useHaptic("light");
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      accessibilityRole='button'
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => ({
        flex: 1,
        height: ACTION_STRIP_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        borderLeftWidth: divider ? 1 : 0,
        borderLeftColor: NeonBoard.line,
      })}
    >
      <View style={{ height: 24, justifyContent: "center" }}>{icon}</View>
      <Text
        variant='overline'
        allowFontScaling={false}
        numberOfLines={1}
        style={{ color: active ? accent : NeonBoard.text }}
      >
        {label}
      </Text>
    </Pressable>
  );
};

/** The strip: cells separated by hairlines, a 1pt `line` rule above and below. */
export const ActionStrip: React.FC<{ children: ReactNode }> = ({
  children,
}) => (
  <View
    style={{
      flexDirection: "row",
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: NeonBoard.line,
    }}
  >
    {children}
  </View>
);
