import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MAX_FONT_SCALE } from "@/constants/neon";
import { type MenuPlacement, placeMenu } from "@/utils/menuLayout";

/**
 * The iPhone's menu look, drawn in React Native for Android phones.
 *
 * iOS shows PlatformDropdown as a SwiftUI `Menu` (a UIMenu): a dark glass card
 * that grows out of the button, covers it, and lists the options with a circle
 * or a filled check-circle on the left. The owner asked Android to match it
 * (parity round 2, Q2), so these numbers are measured from the iPhone 17 Pro
 * Max screenshots (3 px per pt). After the Q1 scaling an Android dp equals an
 * iOS pt, so they are used 1:1.
 */
export const MenuGlass = {
  /** Card fill: (20,21,23) on a near-black page, as measured. */
  card: "rgba(20,21,23,0.96)",
  /** The 1pt light rim round the card. */
  rim: "rgba(255,255,255,0.14)",
  text: "#FFFFFF",
  disabledText: "rgba(255,255,255,0.3)",
  pressed: "rgba(255,255,255,0.1)",
  separator: "rgba(255,255,255,0.12)",
  /** iOS system red in dark mode, used for destructive actions. */
  destructive: "#FF453A",
} as const;

export const MENU = {
  /** Widest the card gets; long labels wrap inside it (52c). */
  maxWidth: 250,
  minWidth: 180,
  radius: 28,
  /** Space above the first row and below the last. */
  padV: 9,
  rowHeight: 42,
  fontSize: 17,
  lineHeight: 22,
  /** Icon column: 17pt glyph whose left edge sits 31pt in from the card. */
  iconLeft: 31,
  iconWidth: 17,
  /** Labels start 64pt in when the menu has icons, 24pt when it has none. */
  textLeftWithIcons: 64,
  textLeft: 24,
  padRight: 25,
  /** Kept clear of the screen edges and the safe area. */
  screenMargin: 8,
  /** Long menus stop at this share of the window height and scroll. */
  maxHeightRatio: 0.54,
} as const;

/** A Material icon (`@expo/vector-icons` MaterialIcons) for a menu row. */
export type MenuIconName = keyof typeof MaterialIcons.glyphMap;

export type MenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MenuRow = {
  key: string;
  label: string;
  /** `on` draws a filled check-circle, `off` an empty circle. */
  check?: "on" | "off";
  /** An icon in the same column, for actions and submenu rows. */
  icon?: MenuIconName;
  disabled?: boolean;
  /** Draws a chevron and opens `children` in place of the list. */
  children?: MenuRow[];
  /** Header shown above `children` (the submenu's title). */
  childrenTitle?: string;
  destructive?: boolean;
  onPress?: () => void;
};

type Props = {
  /** The trigger's frame in window coordinates (`measureInWindow`). */
  anchor: MenuAnchor;
  rows: MenuRow[];
  onClose: () => void;
};

/**
 * The menu card itself, in a transparent Modal so it sits above everything:
 * bottom sheets, the tab bar and the full-screen video player (RN's Modal
 * copies the player's hidden system bars). Tap outside or Android Back closes
 * it. UIMenu doesn't dim the page, so neither does this.
 */
export function MenuPopover({ anchor, rows, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const [root, setRoot] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const [submenu, setSubmenu] = useState<MenuRow | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  // A menu never survives a rotation on iOS; its anchor would be stale.
  const openedAt = useRef({ width: window.width, height: window.height });
  useEffect(() => {
    if (
      window.width !== openedAt.current.width ||
      window.height !== openedAt.current.height
    )
      onClose();
  }, [window.width, window.height, onClose]);

  const visibleRows = submenu?.children ?? rows;
  const hasIcons = useMemo(
    () =>
      visibleRows.some(
        (row) => row.check !== undefined || row.icon !== undefined,
      ),
    [visibleRows],
  );

  const onRootLayout = () => {
    rootRef.current?.measureInWindow((x, y, width, height) =>
      setRoot({ x, y, width, height }),
    );
  };

  const onCardLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      current &&
      Math.abs(current.width - width) < 0.5 &&
      Math.abs(current.height - height) < 0.5
        ? current
        : { width, height },
    );
  };

  // Place the card once its natural size is known (see placeMenu).
  useEffect(() => {
    if (!root || !size) return;
    setPlacement((previous) =>
      placeMenu({
        root,
        anchor,
        size,
        insets,
        margin: MENU.screenMargin,
        maxHeightRatio: MENU.maxHeightRatio,
        previous,
      }),
    );
  }, [root, size, anchor, insets]);

  const shown = placement !== null;
  useEffect(() => {
    if (!shown) return;
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [shown, progress]);

  const pressRow = (row: MenuRow) => {
    if (row.children) {
      setSubmenu(row);
      return;
    }
    onClose();
    row.onPress?.();
  };

  const cardPosition = placement
    ? {
        left: placement.left,
        ...(placement.top !== undefined
          ? { top: placement.top }
          : { bottom: placement.bottom }),
      }
    : // First pass: measure off to the side, invisible.
      { left: 0, top: 0 };

  const transformOrigin = placement
    ? `${placement.alignRight ? "right" : "left"} ${placement.origin}`
    : undefined;

  return (
    <Modal
      visible
      transparent
      animationType='none'
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View
        ref={rootRef}
        collapsable={false}
        style={StyleSheet.absoluteFill}
        onLayout={onRootLayout}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole='button'
          accessibilityLabel={t("common.close")}
        />
        <Animated.View
          accessibilityRole='menu'
          onLayout={onCardLayout}
          style={[
            styles.card,
            cardPosition,
            {
              opacity: placement ? progress : 0,
              transformOrigin,
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={{
              maxHeight:
                placement?.maxHeight ??
                Math.round(window.height * MENU.maxHeightRatio),
            }}
            contentContainerStyle={{ paddingVertical: MENU.padV }}
            bounces={false}
            overScrollMode='never'
          >
            {submenu ? (
              <>
                <MenuRowView
                  row={{
                    key: "back",
                    label: submenu.childrenTitle ?? submenu.label,
                  }}
                  header
                  hasIcons
                  onPress={() => setSubmenu(null)}
                />
                <View style={styles.separator} />
              </>
            ) : null}
            {visibleRows.map((row) => (
              <MenuRowView
                key={row.key}
                row={row}
                hasIcons={hasIcons}
                onPress={() => pressRow(row)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function MenuRowView({
  row,
  hasIcons,
  header = false,
  onPress,
}: {
  row: MenuRow;
  hasIcons: boolean;
  header?: boolean;
  onPress: () => void;
}) {
  const color = row.disabled
    ? MenuGlass.disabledText
    : row.destructive
      ? MenuGlass.destructive
      : MenuGlass.text;
  const isRadio = row.check !== undefined;
  return (
    <Pressable
      onPress={onPress}
      disabled={row.disabled}
      accessibilityRole={isRadio ? "radio" : "menuitem"}
      accessibilityState={{
        disabled: !!row.disabled,
        ...(isRadio ? { checked: row.check === "on" } : null),
      }}
      style={({ pressed }) => [
        styles.row,
        {
          paddingLeft: hasIcons ? MENU.iconLeft : MENU.textLeft,
        },
        pressed && !row.disabled ? styles.rowPressed : null,
      ]}
    >
      {hasIcons ? (
        <View style={styles.iconBox}>
          {header ? (
            <MaterialIcons name='chevron-left' size={22} color={color} />
          ) : row.icon ? (
            <MaterialIcons name={row.icon} size={20} color={color} />
          ) : row.check ? (
            <MaterialIcons
              name={
                row.check === "on" ? "check-circle" : "radio-button-unchecked"
              }
              size={20}
              color={color}
            />
          ) : null}
        </View>
      ) : null}
      <RNText
        allowFontScaling
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.label, { color }, header ? styles.headerLabel : null]}
      >
        {row.label}
      </RNText>
      {row.children ? (
        <MaterialIcons
          name='chevron-right'
          size={21}
          color={color}
          style={styles.chevron}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    minWidth: MENU.minWidth,
    maxWidth: MENU.maxWidth,
    borderRadius: MENU.radius,
    borderWidth: 1,
    borderColor: MenuGlass.rim,
    backgroundColor: MenuGlass.card,
    overflow: "hidden",
    elevation: 16,
  },
  row: {
    minHeight: MENU.rowHeight,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: MENU.padRight,
    paddingVertical: (MENU.rowHeight - MENU.lineHeight) / 2,
  },
  rowPressed: {
    backgroundColor: MenuGlass.pressed,
  },
  iconBox: {
    width: MENU.iconWidth,
    marginRight: MENU.textLeftWithIcons - MENU.iconLeft - MENU.iconWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  label: {
    flexShrink: 1,
    fontSize: MENU.fontSize,
    lineHeight: MENU.lineHeight,
  },
  headerLabel: {
    fontWeight: "600",
  },
  chevron: {
    marginLeft: 12,
    // The glyph is 6pt wide inside a 21pt box; pull the box out so the glyph
    // sits 26pt from the card's edge as on iOS.
    marginRight: -7,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: MenuGlass.separator,
    marginVertical: 4,
  },
});
