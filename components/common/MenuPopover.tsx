import { MaterialIcons } from "@expo/vector-icons";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BackHandler,
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  Text as RNText,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MAX_FONT_SCALE } from "@/constants/neon";
import {
  estimateMenuHeight,
  type MenuPlacement,
  placeMenu,
} from "@/utils/menuLayout";

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
  /**
   * Card fill: (20,21,23) on a near-black page, as measured. Opaque: iOS
   * blurs what is behind its glass, and a translucent fill without the blur
   * lets the page's text show through sharply.
   */
  card: "rgb(20,21,23)",
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

type MenuRequest = Props & { id: number };

/** The open menu, drawn by MenuPopoverHost at the app root. One at a time. */
const menuRequestAtom = atom<MenuRequest | null>(null);
let nextMenuId = 1;

/**
 * Shows the menu card for a trigger while `visible` and its `anchor` are set.
 * Row changes while it is open update it in place.
 */
export function useMenuPopover(
  visible: boolean,
  anchor: MenuAnchor | null,
  rows: MenuRow[],
  onClose: () => void,
) {
  const setRequest = useSetAtom(menuRequestAtom);
  const id = useRef(0);
  const latest = useRef({ rows, onClose });
  latest.current = { rows, onClose };

  useEffect(() => {
    if (!visible || !anchor) return;
    const menuId = nextMenuId++;
    id.current = menuId;
    setRequest({ id: menuId, anchor, ...latest.current });
    return () =>
      setRequest((current) => (current?.id === menuId ? null : current));
  }, [visible, anchor, setRequest]);

  useEffect(() => {
    setRequest((current) =>
      current && current.id === id.current
        ? { ...current, rows, onClose }
        : current,
    );
  }, [rows, onClose, setRequest]);
}

/**
 * Draws the open menu. Mounted once at the app root, after the bottom-sheet
 * provider, so the card sits above pages, sheets and the full-screen player.
 * It works like the old bottom sheet, which also lives in this tree. (An RN
 * Modal was tried first: over the MPV player its dialog window opened, but
 * the card in it did not show.)
 */
export function MenuPopoverHost() {
  const request = useAtomValue(menuRequestAtom);
  return request ? (
    <MenuPopover
      key={request.id}
      anchor={request.anchor}
      rows={request.rows}
      onClose={request.onClose}
    />
  ) : null;
}

/**
 * The full-screen catcher behind the card. A tap on it only closes the menu
 * (owner, round 2 parity review, F2: "The tap that closes a menu must do
 * nothing else"). It is a gesture handler, not a Pressable: gesture-handler
 * looks for handlers through views it treats as see-through, which a plain
 * Pressable is, so the player's progress bar and double-tap under it still
 * took the closing tap and moved the film. A view with a handler of its own
 * ends that search. It takes the whole touch, a drag too, and closes on
 * release.
 */
function Catcher({ onClose, label }: { onClose: () => void; label: string }) {
  const gesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(60_000)
        .maxDistance(100_000)
        .runOnJS(true)
        .onEnd((_event, success) => {
          if (success) onClose();
        }),
    [onClose],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "activate") onClose();
        }}
      />
    </GestureDetector>
  );
}

/**
 * The menu card over a full-screen catcher: a tap outside or Android Back
 * closes it. UIMenu doesn't dim the page, so neither does this.
 */
function MenuPopover({ anchor, rows, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const previousPlacement = useRef<MenuPlacement | null>(null);
  const [submenu, setSubmenu] = useState<MenuRow | null>(null);
  // A submenu opens in the same card, so it keeps the card's width.
  const [lockedWidth, setLockedWidth] = useState<number | undefined>();
  // Reanimated rather than Animated's native driver: over the player, an
  // Animated fade started here never ran and the card stayed invisible.
  const progress = useSharedValue(0);

  // A menu never survives a rotation on iOS; its anchor would be stale. Only
  // an orientation change counts: the window's height also moves when the
  // player hides or shows the system bars.
  const landscape = window.width > window.height;
  const openedLandscape = useRef(landscape).current;
  useEffect(() => {
    if (landscape !== openedLandscape) onClose();
  }, [landscape, openedLandscape, onClose]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose]);

  const visibleRows = submenu?.children ?? rows;
  const hasIcons = useMemo(
    () =>
      visibleRows.some(
        (row) => row.check !== undefined || row.icon !== undefined,
      ),
    [visibleRows],
  );

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

  // Placed on the first frame from the window size and an estimate of the
  // card's height, then refined once its real size is laid out. Waiting for
  // layout first cost two more JS round trips, seconds over a busy player.
  // The side chosen first is kept, so a submenu doesn't flip it.
  const placement = useMemo(
    () =>
      placeMenu({
        root: { x: 0, y: 0, width: window.width, height: window.height },
        anchor,
        size,
        estimatedHeight: estimateMenuHeight(visibleRows.length, !!submenu),
        insets,
        margin: MENU.screenMargin,
        maxHeightRatio: MENU.maxHeightRatio,
        previous: previousPlacement.current,
      }),
    [
      window.width,
      window.height,
      anchor,
      size,
      visibleRows.length,
      submenu,
      insets,
    ],
  );
  useEffect(() => {
    if (!previousPlacement.current) previousPlacement.current = placement;
  }, [placement]);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);
  const fadeIn = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.85 + 0.15 * progress.value }],
  }));

  const pressRow = (row: MenuRow) => {
    if (row.children) {
      setLockedWidth(size?.width);
      setSubmenu(row);
      return;
    }
    onClose();
    row.onPress?.();
  };

  const cardPosition = {
    ...(placement.left !== undefined
      ? { left: placement.left }
      : { right: placement.right }),
    ...(placement.top !== undefined
      ? { top: placement.top }
      : { bottom: placement.bottom }),
  };
  const transformOrigin = `${placement.alignRight ? "right" : "left"} ${placement.origin}`;

  return (
    <View style={styles.overlay}>
      <Catcher onClose={onClose} label={t("common.close")} />
      <Animated.View
        accessibilityRole='menu'
        onLayout={onCardLayout}
        style={[
          styles.card,
          cardPosition,
          submenu && lockedWidth ? { minWidth: lockedWidth } : null,
          { transformOrigin },
          fadeIn,
        ]}
      >
        {/* Virtualised: the language lists hold ~480 rows, and drawing
              them all at once held the menu back for two seconds. */}
        <FlatList
          data={visibleRows}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) => (
            <MenuRowView
              row={item}
              hasIcons={hasIcons}
              onPress={() => pressRow(item)}
            />
          )}
          ListHeaderComponent={
            submenu ? (
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
            ) : null
          }
          initialNumToRender={16}
          maxToRenderPerBatch={32}
          windowSize={9}
          style={{
            maxHeight: placement.maxHeight,
          }}
          contentContainerStyle={{ paddingVertical: MENU.padV }}
          bounces={false}
          overScrollMode='never'
        />
      </Animated.View>
    </View>
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
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Above sibling views that carry elevation (sheets, the tab bar).
    zIndex: 1000,
    elevation: 1000,
  },
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
  // The Material glyphs draw a 17pt circle in a 20pt box; the box is
  // centred on the 17pt column so nothing is clipped.
  iconBox: {
    width: MENU.iconWidth + 3,
    marginLeft: -1.5,
    marginRight: MENU.textLeftWithIcons - MENU.iconLeft - MENU.iconWidth - 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    // Fills the row so a submenu's chevron sits at the right edge.
    flexGrow: 1,
    flexShrink: 1,
    fontSize: MENU.fontSize,
    lineHeight: MENU.lineHeight,
  },
  headerLabel: {
    fontWeight: "600",
  },
  chevron: {
    // The glyph is 6pt wide in the middle of a 21pt box. These margins put
    // it 12pt after the label and 26pt from the card's edge, as on iOS.
    marginLeft: 5,
    marginRight: -8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: MenuGlass.separator,
    marginVertical: 4,
  },
});
