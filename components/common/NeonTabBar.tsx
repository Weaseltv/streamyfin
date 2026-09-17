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
import { NeonBoard } from "@/constants/Colors";
import { glowOverline, glyphGlow, Sizes } from "@/constants/neon";
import { usePageAccent } from "@/utils/atoms/pageAccent";
import { Text } from "./Text";

export const NEON_TAB_BAR_HEIGHT = Sizes.tabBar;

type BottomTabBarProps = Parameters<
  NonNullable<ComponentProps<typeof Tabs>["tabBar"]>
>[0];

const TAB_GLYPHS: Record<string, keyof typeof Feather.glyphMap> = {
  "(home)": "home",
  "(search)": "search",
  "(favorites)": "heart",
  "(watchlists)": "list",
  "(libraries)": "layers",
  "(custom-links)": "link",
  "(settings)": "settings",
};

/**
 * The docked Neon Board tab bar: stage fill, 1pt `line2` top rule, `low`
 * glyphs and uppercase 9pt labels, a 2pt accent overline on the active tab
 * that slides between tabs in 150 ms (dropped under reduce motion). The
 * accent follows the page: volt by default, orange in a movie library, cyan
 * in the guide.
 */
export const NeonTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const accent = usePageAccent();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const routes = state.routes.filter((route) => {
    const options = descriptors[route.key]?.options as
      | (BottomTabBarProps["descriptors"][string]["options"] & {
          href?: unknown;
        })
      | undefined;
    return options?.href !== null;
  });
  const activeIndex = routes.findIndex(
    (route) => route.key === state.routes[state.index]?.key,
  );
  const itemWidth = routes.length > 0 ? width / routes.length : 0;
  const overlineWidth = Math.min(48, Math.max(0, itemWidth * 0.5));

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
          const color = focused ? accent : NeonBoard.low;
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
                paddingTop: 8,
                paddingBottom: 6,
                gap: 5,
              }}
            >
              <View
                style={
                  focused && Platform.OS === "android"
                    ? glyphGlow(accent)
                    : undefined
                }
              >
                <Feather
                  name={TAB_GLYPHS[route.name] ?? "circle"}
                  size={22}
                  color={color}
                />
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
