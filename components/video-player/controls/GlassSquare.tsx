import type { PropsWithChildren } from "react";
import { type StyleProp, TouchableOpacity, type ViewStyle } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glow, Scrims } from "@/constants/neon";

interface Props {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  size?: number;
  /** Accent border + glow (the pause button). */
  accent?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** A glass square over video: `stage` at 0.7 fill, 1pt `line2` border, radius 0. */
export const GlassSquare: React.FC<PropsWithChildren<Props>> = ({
  onPress,
  onLongPress,
  disabled,
  size = 40,
  accent,
  accessibilityLabel,
  accessibilityHint,
  style,
  children,
}) => (
  <TouchableOpacity
    onPress={onPress}
    onLongPress={onLongPress}
    disabled={disabled}
    activeOpacity={0.8}
    accessibilityRole='button'
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
    style={[
      {
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: Scrims.glass,
        borderWidth: accent ? 2 : 1,
        borderColor: accent ?? NeonBoard.line2,
        opacity: disabled ? 0.4 : 1,
      },
      accent ? glow(accent, 16, 0.55) : null,
      style,
    ]}
  >
    {children}
  </TouchableOpacity>
);
