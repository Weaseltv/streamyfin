import {
  Platform,
  Text as RNText,
  type TextProps as RNTextProps,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import {
  FontFace,
  MAX_FONT_SCALE,
  Type,
  type TypeVariant,
} from "@/constants/neon";

export interface TextProps extends RNTextProps {
  /** Neon Board type role. Defaults to Barlow body in `text`. */
  variant?: TypeVariant;
  /** Hex colour for the text; eyebrows and tallies take the page accent. */
  accent?: string;
  /** Secondary copy in `mid`. */
  muted?: boolean;
  className?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * The app's text primitive: Barlow for copy, Barlow Condensed ExtraBold
 * uppercase for titles, section heads, numerals and timecodes. Font scaling
 * is on, capped at 1.3x; fixed frames (tab bar, guide, timecodes) opt out
 * with `allowFontScaling={false}` at the call site.
 */
export function Text({
  variant,
  accent,
  muted,
  style,
  ...otherProps
}: TextProps) {
  if (Platform.isTV) {
    return (
      <RNText
        allowFontScaling={false}
        style={[{ color: "white" }, style]}
        {...otherProps}
      />
    );
  }

  const role: TextStyle | undefined = variant ? Type[variant] : undefined;
  const color =
    accent ??
    (muted
      ? NeonBoard.mid
      : variant === "numeral"
        ? NeonBoard.low
        : NeonBoard.text);

  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[FontFace.body, { color }, role, style]}
      {...otherProps}
    />
  );
}
