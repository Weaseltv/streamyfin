import { MaterialIcons } from "@expo/vector-icons";
import type { Stack } from "expo-router";
import { type ComponentProps, type ReactNode, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NeonBoard } from "@/constants/Colors";

type ScreenOptions = Extract<
  NonNullable<ComponentProps<typeof Stack.Screen>["options"]>,
  { header?: unknown }
>;
export type PhoneStackHeaderProps = Parameters<
  NonNullable<ScreenOptions["header"]>
>[0];

/**
 * The iPhone's page header, drawn on Android phones (owner, round 1 parity
 * review, F7/F8). Measured on the iPhone 17 Pro Max: a 44pt bar under the
 * status bar, a round 44pt back button 20pt from the left edge, the title
 * centred on the screen, and the right-side actions in a 44pt pill ending
 * 20pt from the right edge. The native Android toolbar put the title on the
 * left beside a plain arrow and left actions bare.
 *
 * iOS 26 draws the button and pill as glass; Android has no glass, so both are
 * the same dark fill with a hairline edge the glass shows on the dark stage.
 */
export const PHONE_HEADER_BAR_HEIGHT = 44;
const BUTTON = 44;
const EDGE = 20;
const GLASS_FILL = "rgba(28, 29, 31, 0.72)";
const GLASS_EDGE = "rgba(255, 255, 255, 0.12)";

/** Glass pill around header actions; hides itself when the actions render nothing. */
const ActionsPill = ({ children }: { children: ReactNode }) => {
  const [empty, setEmpty] = useState(false);
  return (
    <View style={[styles.pill, empty && styles.pillEmpty]}>
      <View
        onLayout={(e) => setEmpty(e.nativeEvent.layout.width < 1)}
        style={styles.pillContent}
      >
        {children}
      </View>
    </View>
  );
};

export const PhoneStackHeader = ({
  navigation,
  route,
  options,
  back,
}: PhoneStackHeaderProps) => {
  const insets = useSafeAreaInsets();
  const tintColor = options.headerTintColor ?? NeonBoard.text;
  const titleText =
    typeof options.headerTitle === "string"
      ? options.headerTitle
      : (options.title ?? route.name);
  const canGoBack = !!back || navigation.canGoBack();

  const left =
    options.headerLeft !== undefined ? (
      options.headerLeft({ tintColor, canGoBack })
    ) : canGoBack ? (
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={back?.title ?? "Back"}
        onPress={navigation.goBack}
        style={styles.back}
      >
        <MaterialIcons
          name='arrow-back-ios-new'
          size={24}
          color={tintColor}
          style={styles.backGlyph}
        />
      </Pressable>
    ) : null;

  const right = options.headerRight?.({ tintColor, canGoBack });

  const title =
    typeof options.headerTitle === "function" ? (
      options.headerTitle({ children: titleText, tintColor })
    ) : (
      <Text
        numberOfLines={1}
        style={[styles.title, options.headerTitleStyle as object]}
      >
        {titleText}
      </Text>
    );

  const background = options.headerTransparent
    ? "transparent"
    : ((
        StyleSheet.flatten(options.headerStyle as object) as
          | { backgroundColor?: string }
          | undefined
      )?.backgroundColor ?? NeonBoard.stage);

  // A transparent header is laid over the page by the native stack itself,
  // which also measures this view for useHeaderHeight() (the band
  // ParallaxPage fades in behind the header on scroll). Positioning it
  // absolutely here made that height 0.
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: background }}>
      <View style={styles.bar}>
        <View style={styles.titleBox} pointerEvents='box-none'>
          {title}
        </View>
        <View style={styles.side}>{left}</View>
        <View style={[styles.side, styles.sideRight]}>
          {right ? <ActionsPill>{right}</ActionsPill> : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: PHONE_HEADER_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: EDGE,
  },
  titleBox: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: EDGE + BUTTON + 12,
    right: EDGE + BUTTON + 12,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: NeonBoard.text, textAlign: "center" },
  side: { flexDirection: "row", alignItems: "center" },
  sideRight: { justifyContent: "flex-end" },
  back: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: GLASS_FILL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS_EDGE,
    alignItems: "center",
    justifyContent: "center",
  },
  // The glyph's ink sits right of its em square's centre; nudge it to the middle.
  backGlyph: { marginLeft: -2 },
  pill: {
    minWidth: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    backgroundColor: GLASS_FILL,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS_EDGE,
    // iOS 26 glass hugs the actions with about 3 pt each side (cast pill 50.8 wide,
    // Export logs 130); the group and text buttons carry their own 8 inset.
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  pillEmpty: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    minWidth: 0,
  },
  pillContent: { flexDirection: "row", alignItems: "center" },
});
