import type { PropsWithChildren } from "react";
import { type ViewProps } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { NeonBoard } from "@/constants/Colors";
import { Scrims, Sizes } from "@/constants/neon";
import { useHaptic } from "@/hooks/useHaptic";

interface Props extends ViewProps {
  onPress?: () => void;
  /**
   * `glass` draws the 40 square over video and backdrops (`stage` at 0.7 fill,
   * 1pt `line2`); `plain` is the 36 icon button used elsewhere. `background`
   * is the legacy name for `glass`.
   */
  variant?: "glass" | "plain";
  background?: boolean;
  /** `large` matches the header grid (glyph-sized box, spacing owned by the group). */
  size?: "default" | "large";
  hapticFeedback?: boolean;
}

/** Keeps the touch target at 44pt now that the large box is glyph-sized. */
const LARGE_HIT_SLOP = 10;

/**
 * The square icon button (formerly `RoundButton`). Over video and backdrops it
 * is a glass square; in headers (`size="large"`) it matches `HeaderButton`'s
 * glyph-sized box so item-page buttons land on the same grid.
 */
export const SquareButton: React.FC<PropsWithChildren<Props>> = ({
  variant,
  background = false,
  onPress,
  children,
  size = "default",
  hapticFeedback = true,
  style,
  ...viewProps
}) => {
  const isLarge = size === "large";
  const glass = variant === "glass" || background;
  const lightHapticFeedback = useHaptic("light");

  const handlePress = () => {
    if (hapticFeedback) {
      lightHapticFeedback();
    }
    onPress?.();
  };

  // The RNGH Pressable (required for macOS Catalyst headers) handles its press
  // natively, outside RN's responder system — so a parent RN touchable (e.g.
  // TouchableItemRouter around an episode card) would also fire. Claiming the
  // responder restores the "innermost touchable wins" behavior.
  const claimResponder = () => true;

  // `large` lives in item-page headers over a backdrop: the 36 glass square.
  const box = isLarge ? 36 : glass ? Sizes.glass : Sizes.iconButton;
  const drawGlass = glass || isLarge;

  return (
    <Pressable
      onPress={handlePress}
      onStartShouldSetResponder={claimResponder}
      hitSlop={isLarge ? LARGE_HIT_SLOP : undefined}
      style={[
        {
          height: box,
          width: box,
          alignItems: "center",
          justifyContent: "center",
        },
        drawGlass
          ? {
              backgroundColor: Scrims.glass,
              borderWidth: 1,
              borderColor: NeonBoard.line2,
            }
          : null,
        style,
      ]}
      {...(viewProps as any)}
    >
      {children}
    </Pressable>
  );
};

/** @deprecated Use `SquareButton`. Kept for one release. */
export const RoundButton = SquareButton;
