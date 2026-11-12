import * as Haptics from "expo-haptics";
import { Tabs } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { glowOf, NeonBoard, sectionAccent } from "@/constants/Colors";
import { rgba, Sizes, Type } from "@/constants/neon";
import { NavIcon, type NavIconName } from "./NavIcon";
import { Text } from "./Text";

export const NEON_TAB_BAR_HEIGHT = Sizes.tabBar;

/** Keep the music mini-player aligned with the iOS regular-width dock. */
export function useNeonTabBarLayout() {
  const { width } = useWindowDimensions();
  const regular = Platform.OS === "ios" && Platform.isPad && width >= 768;
  return {
    height: regular ? 76 : NEON_TAB_BAR_HEIGHT,
    horizontalPadding: regular ? 120 : 0,
  };
}

type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

type TabDesign = {
  icon: NavIconName;
  accent: string;
};

/** The TV rail's label colour at rest (`NavDrawer.kt`). */
const LABEL_REST = "#E1E4EC";

/**
 * Preserve the phone's four destinations. Expo Router strips `href` before
 * passing options to a custom bar, so hidden routes need an explicit allowlist.
 * Icons are the TV rail's; the Library hub (phone only) uses its folder.
 */
const TABS: Record<string, TabDesign> = {
  "(home)": { icon: "home", accent: sectionAccent("home") },
  "(search)": { icon: "search", accent: sectionAccent("search") },
  "(favorites)": { icon: "favorites", accent: sectionAccent("watchlist") },
  "(libraries)": { icon: "collections", accent: sectionAccent("library") },
};

const IS_IOS = Platform.OS === "ios";

function TabArtwork({
  tab,
  focused,
  reduceMotion,
  label,
}: {
  tab: TabDesign;
  focused: boolean;
  reduceMotion: boolean;
  label: string;
}) {
  const selection = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    selection.value =
      IS_IOS && !reduceMotion
        ? withTiming(focused ? 1 : 0, {
            duration: 120,
            easing: Easing.inOut(Easing.ease),
          })
        : focused
          ? 1
          : 0;
  }, [focused, reduceMotion, selection]);
  const activeStyle = useAnimatedStyle(() => ({ opacity: selection.value }));
  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - selection.value }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(selection.value, [0, 1], [LABEL_REST, tab.accent]),
  }));

  // As on the TV rail, the glyph is always in the section's glow colour;
  // the selected tab adds a glow behind it.
  const glow = glowOf(tab.accent);
  const icon = () => <NavIcon name={tab.icon} color={glow} size={24} />;

  return (
    <>
      <Animated.View
        pointerEvents='none'
        style={[
          styles.overline,
          {
            backgroundColor: tab.accent,
            boxShadow: `0 0 10px ${rgba(glow, IS_IOS ? 0.55 : 0.65)}`,
          },
          activeStyle,
        ]}
      />
      <View pointerEvents='none' style={styles.artwork}>
        <View style={styles.icon}>
          {/* Keep both iOS rasters resident to avoid a blank frame on selection. */}
          <Animated.View style={[styles.iconLayer, idleStyle]}>
            {icon()}
          </Animated.View>
          <Animated.View
            style={[
              styles.iconLayer,
              IS_IOS
                ? {
                    shadowColor: glow,
                    shadowOpacity: 0.85,
                    shadowRadius: 3.5,
                    shadowOffset: { width: 0, height: 0 },
                  }
                : { boxShadow: `0 0 8px ${rgba(glow, 0.22)}` },
              activeStyle,
            ]}
          >
            {icon()}
          </Animated.View>
        </View>
        <Animated.Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit={IS_IOS}
          minimumFontScale={0.85}
          style={[Type.overline, styles.label, labelStyle]}
        >
          {label}
        </Animated.Text>
      </View>
    </>
  );
}

/** WeaselTV's dock: fixed type, neutral idle tabs and a per-item neon overline. */
export const NeonTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const layout = useNeonTabBarLayout();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [tooltipKey, setTooltipKey] = useState<string | null>(null);

  useEffect(() => {
    if (!tooltipKey) return;
    const timeout = setTimeout(() => setTooltipKey(null), 1500);
    return () => clearTimeout(timeout);
  }, [tooltipKey]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const routes = state.routes.filter((route) => route.name in TABS);
  const activeKey = state.routes[state.index]?.key;
  if (!routes.some((route) => route.key === activeKey)) return null;

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          paddingLeft: Math.max(insets.left, layout.horizontalPadding),
          paddingRight: Math.max(insets.right, layout.horizontalPadding),
        },
      ]}
    >
      <View pointerEvents='none' style={styles.topRule} />
      <View style={{ flexDirection: "row", height: layout.height }}>
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === activeKey;
          const label =
            typeof options.title === "string" ? options.title : route.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole='tab'
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              accessibilityShowsLargeContentViewer={IS_IOS}
              accessibilityLargeContentTitle={label}
              testID={options.tabBarButtonTestID}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (event.defaultPrevented) return;
                setTooltipKey(null);
                if (IS_IOS) {
                  void Haptics.impactAsync(
                    Haptics.ImpactFeedbackStyle.Soft,
                  ).catch(() => {});
                }
                if (!focused) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => {
                navigation.emit({ type: "tabLongPress", target: route.key });
                if (Platform.OS === "android") {
                  setTooltipKey(route.key);
                }
              }}
              style={styles.item}
            >
              {tooltipKey === route.key ? (
                <View pointerEvents='none' style={styles.tooltip}>
                  <Text variant='body'>{label}</Text>
                </View>
              ) : null}
              <TabArtwork
                tab={TABS[route.name]}
                focused={focused}
                reduceMotion={reduceMotion}
                label={label}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { backgroundColor: NeonBoard.stage },
  topRule: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: NeonBoard.line2,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  overline: { position: "absolute", top: 0, left: 8, right: 8, height: 2 },
  artwork: {
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 4,
    paddingTop: IS_IOS ? 0 : 6,
    paddingBottom: IS_IOS ? 0 : 4,
  },
  icon: { width: 28, height: IS_IOS ? 26 : 24 },
  iconLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltip: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: NeonBoard.card2,
  },
  label: { textAlign: "center", includeFontPadding: false },
});
