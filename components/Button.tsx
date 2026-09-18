import type React from "react";
import {
  type PropsWithChildren,
  type ReactNode,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text as RNText,
  type StyleProp,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowButton, Sizes } from "@/constants/neon";
import { useHaptic } from "@/hooks/useHaptic";
import { usePageAccent } from "@/utils/atoms/pageAccent";
import { scaleSize } from "@/utils/scaleSize";
import { Text } from "./common/Text";
import { Loader } from "./Loader";

const getColorClasses = (
  color: "primary" | "red" | "black" | "transparent" | "white",
  variant: "solid" | "border",
  focused: boolean,
): string => {
  if (variant === "border") {
    switch (color) {
      case "primary":
        return focused
          ? "bg-transparent border-2 border-white"
          : "bg-transparent border-2 border-volt";
      case "red":
        return focused
          ? "bg-transparent border-2 border-red-400"
          : "bg-transparent border-2 border-red-600";
      case "black":
        return focused
          ? "bg-transparent border-2 border-neutral-700"
          : "bg-transparent border-2 border-neutral-900";
      case "white":
        return focused
          ? "bg-transparent border-2 border-gray-100"
          : "bg-transparent border-2 border-white";
      case "transparent":
        return focused
          ? "bg-transparent border-2 border-gray-400"
          : "bg-transparent border-2 border-gray-600";
      default:
        return "";
    }
  } else {
    switch (color) {
      case "primary":
        return focused
          ? "bg-white border-2 border-white"
          : "bg-volt border border-volt";
      case "red":
        return "bg-red-600";
      case "black":
        return "bg-neutral-900";
      case "white":
        return focused
          ? "bg-gray-100 border-2 border-gray-300"
          : "bg-white border border-gray-200";
      case "transparent":
        return "bg-transparent";
      default:
        return "";
    }
  }
};

export interface ButtonProps
  extends React.ComponentProps<typeof TouchableOpacity> {
  onPress?: () => void;
  className?: string;
  textClassName?: string;
  disabled?: boolean;
  children?: string | ReactNode;
  loading?: boolean;
  /**
   * Legacy colour roles. `primary` is the page / item accent (override with
   * `accent`), `red` is destructive, `white` an outline in `text`, `black` /
   * `transparent` a quiet outline in `line2`.
   */
  color?: "primary" | "red" | "black" | "transparent" | "white";
  /** `solid` = filled primary with a glow; `border` = 1pt outline. */
  variant?: "solid" | "border";
  /** Hex accent for the button: the section or item type colour. */
  accent?: string;
  /** 34 high instead of 48 (the hero RESUME, the next-up RESUME). */
  compact?: boolean;
  iconRight?: ReactNode;
  iconLeft?: ReactNode;
  justify?: "center" | "between";
}

/**
 * Neon Board button. Primary: 48 high, filled accent, `onAccent` Condensed
 * 800 15 upper label, glow `0 0 18` at 0.45. Outline: 44 high, 1pt accent
 * border, accent label. Pressed = 0.85 opacity, disabled = `line2` border
 * with a `low` label.
 */
export const Button: React.FC<PropsWithChildren<ButtonProps>> = ({
  onPress,
  className = "",
  textClassName = "",
  disabled = false,
  loading = false,
  color = "primary",
  variant = "solid",
  accent,
  compact = false,
  iconRight,
  iconLeft,
  children,
  justify = "center",
  style,
  ...props
}) => {
  const pageAccent = usePageAccent();
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 130,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const lightHapticFeedback = useHaptic("light");

  if (Platform.isTV) {
    const colorClasses = getColorClasses(color, variant, focused);
    const textColorClass =
      variant === "solid" && (color === "white" || color === "primary")
        ? "text-stage"
        : "text-white";
    return (
      <Pressable
        className='w-full'
        onPress={onPress}
        onFocus={() => {
          setFocused(true);
          animateTo(1.03);
        }}
        onBlur={() => {
          setFocused(false);
          animateTo(1);
        }}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
            shadowColor: "#ffffff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.5 : 0,
            shadowRadius: focused ? scaleSize(10) : 0,
            elevation: focused ? 12 : 0, // Android glow
          }}
        >
          <View
            style={{
              borderRadius: scaleSize(16),
              paddingVertical: scaleSize(14),
              alignItems: "center",
              justifyContent: "center",
            }}
            className={`${colorClasses} ${className}`}
          >
            <RNText
              style={{
                fontSize: scaleSize(20),
                fontWeight: "bold",
              }}
              className={textColorClass}
            >
              {children}
            </RNText>
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  const isInactive = disabled || loading;
  const tone =
    accent ??
    (color === "red"
      ? NeonBoard.red
      : color === "white"
        ? NeonBoard.text
        : color === "black" || color === "transparent"
          ? NeonBoard.line2
          : pageAccent);
  const isOutline =
    variant === "border" || color === "black" || color === "transparent";
  const quiet = color === "black" || color === "transparent";

  const box: ViewStyle = isOutline
    ? {
        height: compact ? Sizes.buttonCompact : Sizes.outline,
        borderWidth: 1,
        borderColor: isInactive ? NeonBoard.line2 : tone,
        backgroundColor: "transparent",
      }
    : {
        height: compact ? Sizes.buttonCompact : Sizes.button,
        backgroundColor: isInactive ? NeonBoard.card2 : tone,
        ...(isInactive ? null : glowButton(tone)),
      };
  const labelColor = isInactive
    ? NeonBoard.low
    : isOutline
      ? quiet
        ? NeonBoard.text
        : tone
      : NeonBoard.onAccent;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      className={`items-center justify-center ${className}`}
      style={[
        { paddingHorizontal: 20, justifyContent: "center" },
        box,
        style as StyleProp<ViewStyle>,
      ]}
      onPress={() => {
        if (!loading && !disabled && onPress) {
          onPress();
          lightHapticFeedback();
        }
      }}
      disabled={isInactive}
      {...props}
    >
      {loading ? (
        <Loader color={labelColor} />
      ) : (
        <View
          className={`flex flex-row items-center w-full ${
            justify === "between" ? "justify-between" : "justify-center"
          }`}
          style={{ gap: 10 }}
        >
          {iconLeft ?? null}
          <Text
            variant='button'
            numberOfLines={1}
            allowFontScaling={false}
            className={textClassName}
            style={{ color: labelColor }}
          >
            {children}
          </Text>
          {iconRight ?? null}
        </View>
      )}
    </TouchableOpacity>
  );
};
