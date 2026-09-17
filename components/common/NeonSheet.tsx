import { Feather } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { ReactNode } from "react";
import {
  type StyleProp,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, Scrims, Sizes } from "@/constants/neon";
import { Text } from "./Text";

/**
 * The P14 sheet panel: `card` fill, 1pt `line2` top border, radius 0.
 * Spread `neonSheetModalProps` onto every `BottomSheetModal` and wrap the
 * content in `NeonSheet` (head + rows + primary) or reuse `NeonSheetHead`.
 */
export const neonSheetBackgroundStyle = {
  backgroundColor: NeonBoard.card,
  borderRadius: 0,
  borderTopWidth: 1,
  borderTopColor: NeonBoard.line2,
} as const;

/** No grabber: the head carries the close glyph. */
export const neonSheetHandleIndicatorStyle = {
  backgroundColor: "transparent",
  height: 0,
  width: 0,
} as const;

export const neonSheetHandleStyle = { padding: 0, height: 0 } as const;

/** Flat `stage` scrim at 0.6 - no blur. */
export const NeonSheetBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop
    {...props}
    disappearsOnIndex={-1}
    appearsOnIndex={0}
    opacity={1}
    style={[props.style, { backgroundColor: Scrims.modal }]}
  />
);

export const neonSheetModalProps = {
  backgroundStyle: neonSheetBackgroundStyle,
  handleIndicatorStyle: neonSheetHandleIndicatorStyle,
  handleStyle: neonSheetHandleStyle,
  backdropComponent: NeonSheetBackdrop,
} as const;

interface HeadProps {
  /** Small uppercase line above the title, in the accent. */
  eyebrow?: string | null;
  title: string;
  /** Section accent for the tally and the rule. Defaults to volt. */
  accent?: string;
  /** Renders the close glyph on the right. */
  onClose?: () => void;
  /** Something other than the close glyph on the right. */
  right?: ReactNode;
  /** Back chevron before the title (second views inside one sheet). */
  onBack?: () => void;
}

/**
 * Sheet head: 3pt tally on the panel's left edge, eyebrow + Condensed 24
 * title, close glyph, and a 2pt accent rule with a glow underneath.
 */
export const NeonSheetHead: React.FC<HeadProps> = ({
  eyebrow,
  title,
  accent = NeonBoard.volt,
  onClose,
  right,
  onBack,
}) => (
  <View>
    <View
      style={{
        paddingLeft: Sizes.rowLead,
        paddingRight: Sizes.gutter,
        paddingTop: 14,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View
        style={[
          {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: Sizes.tally,
            backgroundColor: accent,
          },
          glowRule(accent),
        ]}
      />
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          hitSlop={8}
          accessibilityRole='button'
          style={{ marginRight: 8 }}
        >
          <Feather name='chevron-left' size={24} color={NeonBoard.text} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1, paddingRight: 12 }}>
        {eyebrow ? (
          <Text variant='eyebrow' accent={accent} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text
          variant='pageTitle'
          numberOfLines={1}
          style={{ marginTop: eyebrow ? 2 : 0 }}
        >
          {title}
        </Text>
      </View>
      {right ??
        (onClose ? (
          <TouchableOpacity
            onPress={onClose}
            hitSlop={8}
            accessibilityRole='button'
            style={{
              width: Sizes.iconButton,
              height: Sizes.iconButton,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name='x' size={22} color={NeonBoard.text} />
          </TouchableOpacity>
        ) : null)}
    </View>
    <View style={[{ height: 2, backgroundColor: accent }, glowRule(accent)]} />
  </View>
);

interface SheetProps extends HeadProps {
  children?: ReactNode;
  /** The primary action (usually a `Button`) pinned under the content. */
  primary?: ReactNode;
  /** Content scrolls (BottomSheetScrollView) instead of sizing to fit. */
  scroll?: boolean;
  /** `flex: 1` for sheets with fixed snap points. */
  fill?: boolean;
  /** Extra bottom padding (a keyboard, for instance). */
  extraBottom?: number;
  contentStyle?: StyleProp<ViewStyle>;
  /** Horizontal padding for the content. Rows want 0, copy wants the gutter. */
  gutter?: number;
}

/**
 * A complete P14 panel: head, content, primary at the bottom, safe-area
 * padding. Put it inside a `BottomSheetModal` that spreads
 * `neonSheetModalProps`, or hand it to `showModal`.
 */
export const NeonSheet: React.FC<SheetProps> = ({
  children,
  primary,
  scroll = false,
  fill = false,
  extraBottom = 0,
  contentStyle,
  gutter = 0,
  ...head
}) => {
  const insets = useSafeAreaInsets();
  const Container = scroll ? BottomSheetScrollView : BottomSheetView;
  const body = (
    <>
      <View style={[{ paddingHorizontal: gutter }, contentStyle]}>
        {children}
      </View>
      {primary ? (
        <View
          style={{
            paddingHorizontal: Sizes.gutter,
            paddingTop: 16,
          }}
        >
          {primary}
        </View>
      ) : null}
    </>
  );

  return (
    <Container
      style={fill ? { flex: 1 } : undefined}
      contentContainerStyle={
        scroll
          ? { paddingBottom: Math.max(16, insets.bottom) + extraBottom }
          : undefined
      }
    >
      <NeonSheetHead {...head} />
      {scroll ? (
        body
      ) : (
        <View
          style={{
            flex: fill ? 1 : undefined,
            paddingBottom: Math.max(16, insets.bottom) + extraBottom,
          }}
        >
          {body}
        </View>
      )}
    </Container>
  );
};

interface RowProps {
  label: string;
  subtitle?: string | null;
  /** Trailing value in `mid`. */
  value?: string | null;
  /** Selected rows carry the accent tally and a check glyph. */
  selected?: boolean;
  accent?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Leading glyph (Feather name) in the accent. */
  icon?: keyof typeof Feather.glyphMap;
  /** Destructive rows: label and glyph in red. */
  destructive?: boolean;
  /** Anything on the right instead of the check / value (a switch, a chevron). */
  right?: ReactNode;
  showArrow?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A 52 hairline row inside a sheet: 16 leading pad, 1pt `line` bottom rule.
 * Selected = 3pt accent tally + Feather `check` in the accent.
 */
export const NeonSheetRow: React.FC<RowProps> = ({
  label,
  subtitle,
  value,
  selected = false,
  accent = NeonBoard.volt,
  onPress,
  disabled = false,
  icon,
  destructive = false,
  right,
  showArrow = false,
  style,
}) => {
  const tone = destructive ? NeonBoard.red : NeonBoard.text;
  const glyph = destructive ? NeonBoard.red : accent;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={{ selected, disabled }}
      style={[
        {
          minHeight: 52,
          paddingVertical: 8,
          paddingLeft: Sizes.rowLead,
          paddingRight: Sizes.gutter,
          flexDirection: "row",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: NeonBoard.line,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {selected ? (
        <View
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: Sizes.tally,
              backgroundColor: accent,
            },
            glowRule(accent),
          ]}
        />
      ) : null}
      {icon ? (
        <Feather
          name={icon}
          size={18}
          color={glyph}
          style={{ marginRight: 14 }}
        />
      ) : null}
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text variant='rowTitle' numberOfLines={2} style={{ color: tone }}>
          {label}
        </Text>
        {subtitle ? (
          <Text variant='meta' muted numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (value ? (
          <Text
            variant='meta'
            muted
            numberOfLines={1}
            style={{ fontSize: 13, maxWidth: "45%" }}
          >
            {value}
          </Text>
        ) : null)}
      {selected && !right ? (
        <Feather
          name='check'
          size={18}
          color={accent}
          style={{ marginLeft: 10 }}
        />
      ) : null}
      {showArrow ? (
        <Feather
          name='chevron-right'
          size={18}
          color={NeonBoard.low}
          style={{ marginLeft: 6 }}
        />
      ) : null}
    </TouchableOpacity>
  );
};

/** A 13 `mid` note between the head and the rows. */
export const NeonSheetNote: React.FC<{
  children: ReactNode;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ children, center = false, style }) => (
  <View
    style={[
      { paddingHorizontal: Sizes.rowLead, paddingTop: 14, paddingBottom: 4 },
      style,
    ]}
  >
    <Text
      variant='body'
      muted
      style={{
        fontSize: 13,
        lineHeight: 18,
        textAlign: center ? "center" : "left",
      }}
    >
      {children}
    </Text>
  </View>
);
