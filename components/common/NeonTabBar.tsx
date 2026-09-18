import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { type ComponentProps, useEffect, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { glowOverline, glyphGlow, rgba, Sizes } from "@/constants/neon";
import { Text } from "./Text";

export const NEON_TAB_BAR_HEIGHT = Sizes.tabBar;

type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

/**
 * The phone's tabs, in order. Anything else in the route tree (Streamystats
 * watchlists, custom links, settings) is never a tab: expo-router strips
 * `href` from the options it hands a custom bar, so the bar cannot rely on it.
 */
const TABS: Record<
  string,
  { glyph: keyof typeof Feather.glyphMap; accent: string }
> = {
  "(home)": { glyph: "home", accent: sectionAccent("home") },
  "(search)": { glyph: "search", accent: sectionAccent("search") },
  "(favorites)": { glyph: "heart", accent: sectionAccent("watchlist") },
  "(libraries)": { glyph: "layers", accent: sectionAccent("library") },
};

/** Tabs that are not selected wear their neon at this strength. */
const IDLE_ALPHA = 0.55;

/**
 * The docked Neon Board tab bar: stage fill, 1pt `line2` top rule, glyphs and
 * uppercase labels, a 2pt overline on the active tab that slides between
 * tabs in 150 ms (dropped under reduce motion). Every tab owns a neon (Home
 * volt, Search cyan, Watchlist blue, Library indigo): dimmed at rest, full
 * strength with the overline when selected.
 */
export const NeonTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const routes = state.routes.filter((route) => route.name in TABS);
  const activeIndex = routes.findIndex(
    (route) => route.key === state.routes[state.index]?.key,
  );
  const accent = TABS[routes[activeIndex]?.name]?.accent ?? NeonBoard.volt;
  const itemWidth = routes.length > 0 ? width / routes.length : 0;
  const overlineWidth = Math.min(56, Math.max(0, itemWidth * 0.5));

  const x = useSharedValue(0);
  useEffect(() => {
    const target = activeIndex * itemWidth + (itemWidth - overlineWidth) / 2;
    x.value = reduceMotion ? target : withTiming(target, { duration: 150 });
  }, [activeIndex, itemWidth, overlineWidth, reduceMotion, x]);
  const overlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  if (activeIndex < 0) return null;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        backgroundColor: NeonBoard.stage,
        borderTopWidth: 1,
        borderTopColor: NeonBoard.line2,
        paddingBottom: insets.bottom,
      }}
    >
      {width > 0 ? (
        <Animated.View
          pointerEvents='none'
          style={[
            {
              position: "absolute",
              top: -1,
              left: 0,
              height: 2,
              width: overlineWidth,
              backgroundColor: accent,
            },
            glowOverline(accent),
            overlineStyle,
          ]}
        />
      ) : null}
      <View style={{ flexDirection: "row", height: NEON_TAB_BAR_HEIGHT }}>
        {routes.map((route) => {
          const { options } = descriptors[route.key];
          const focused = route.key === state.routes[state.index]?.key;
          const label =
            typeof options.title === "string" ? options.title : route.name;
          const tab = TABS[route.name];
          const color = focused ? tab.accent : rgba(tab.accent, IDLE_ALPHA);
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole='tab'
              accessibilityState={{ selected: focused }}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
              testID={options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 10,
                paddingBottom: 8,
                gap: 6,
              }}
            >
              <View
                style={
                  focused && Platform.OS === "android"
                    ? glyphGlow(tab.accent)
                    : undefined
                }
              >
                <Feather name={tab.glyph} size={26} color={color} />
              </View>
              <Text
                variant='overline'
                allowFontScaling={false}
                numberOfLines={1}
                style={{ color }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
