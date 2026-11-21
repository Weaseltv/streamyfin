import {
  type ActionSheetOptions,
  useActionSheet,
} from "@expo/react-native-action-sheet";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  Text as RNText,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuGlass } from "@/components/common/MenuPopover";
import { MAX_FONT_SCALE } from "@/constants/neon";

/**
 * iOS 26's action sheet (ActionSheetIOS without an anchor), measured from the
 * iPhone 17 Pro Max screenshots 01d and 31c: a 320pt glass card centred in the
 * safe area over a 48% black scrim, one 48pt pill per action 8pt apart with
 * 16pt round them, Cancel last as one more pill, no title. 17pt labels.
 */
const SHEET = {
  width: 320,
  /** Kept clear of narrow windows' edges. */
  sideMargin: 20,
  radius: 32,
  pad: 16,
  gap: 8,
  pillHeight: 48,
  pillFill: "rgba(255,255,255,0.12)",
  pillPressed: "rgba(255,255,255,0.22)",
  scrim: "rgba(0,0,0,0.48)",
} as const;

type Props = {
  options: string[];
  cancelButtonIndex?: number;
  destructiveButtonIndex?: number | number[];
  /** Called once with the chosen index, or the cancel index for a dismiss. */
  onSelect: (index?: number) => void;
};

export function ActionSheetCard({
  options,
  cancelButtonIndex,
  destructiveButtonIndex,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const done = useRef(false);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const select = (index?: number) => {
    if (done.current) return;
    done.current = true;
    onSelect(index);
  };
  const cancel = () => select(cancelButtonIndex);

  const destructive = new Set(
    destructiveButtonIndex === undefined
      ? []
      : Array.isArray(destructiveButtonIndex)
        ? destructiveButtonIndex
        : [destructiveButtonIndex],
  );
  // iOS draws Cancel last whatever its index.
  const order = options.map((_, index) => index);
  if (cancelButtonIndex !== undefined && cancelButtonIndex < options.length) {
    order.splice(order.indexOf(cancelButtonIndex), 1);
    order.push(cancelButtonIndex);
  }

  const width = Math.min(SHEET.width, window.width - 2 * SHEET.sideMargin);
  const maxHeight = window.height - insets.top - insets.bottom - 32;

  return (
    <Modal
      visible
      transparent
      animationType='none'
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={cancel}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: SHEET.scrim, opacity: progress },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={cancel}
          accessibilityRole='button'
          accessibilityLabel={t("common.cancel")}
        />
      </Animated.View>
      <View
        pointerEvents='box-none'
        style={[
          StyleSheet.absoluteFill,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        <Animated.View
          style={[
            styles.card,
            {
              width,
              opacity: progress,
              transform: [
                {
                  scale: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <ScrollView
            style={{ maxHeight }}
            contentContainerStyle={styles.content}
            bounces={false}
            overScrollMode='never'
          >
            {order.map((index) => (
              <Pressable
                key={index}
                onPress={() => select(index)}
                accessibilityRole='button'
                style={({ pressed }) => [
                  styles.pill,
                  pressed ? { backgroundColor: SHEET.pillPressed } : null,
                ]}
              >
                <RNText
                  allowFontScaling
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  numberOfLines={2}
                  style={[
                    styles.label,
                    destructive.has(index)
                      ? { color: MenuGlass.destructive }
                      : null,
                  ]}
                >
                  {options[index]}
                </RNText>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

type Request = {
  options: ActionSheetOptions;
  callback: (index?: number) => void | Promise<void>;
};

/**
 * `useActionSheet().showActionSheetWithOptions` with the iPhone's action-sheet
 * card on Android phones. Render `actionSheet` somewhere in the caller; it is
 * null until a sheet is open. iOS and TV keep the library's native sheet.
 * Titles and Android-only styling options are ignored on the card: iOS shows
 * these sheets without a title.
 */
export function useMenuActionSheet(): {
  showActionSheetWithOptions: (
    options: ActionSheetOptions,
    callback: (index?: number) => void | Promise<void>,
  ) => void;
  actionSheet: ReactNode;
} {
  const { showActionSheetWithOptions: showNative } = useActionSheet();
  const [request, setRequest] = useState<Request | null>(null);

  const showActionSheetWithOptions = useCallback(
    (
      options: ActionSheetOptions,
      callback: (index?: number) => void | Promise<void>,
    ) => {
      if (Platform.OS === "android" && !Platform.isTV) {
        setRequest({ options, callback });
        return;
      }
      showNative(options, callback);
    },
    [showNative],
  );

  const actionSheet = request ? (
    <ActionSheetCard
      options={request.options.options}
      cancelButtonIndex={request.options.cancelButtonIndex}
      destructiveButtonIndex={request.options.destructiveButtonIndex}
      onSelect={(index) => {
        setRequest(null);
        request.callback(index);
      }}
    />
  ) : null;

  return { showActionSheetWithOptions, actionSheet };
}

const styles = StyleSheet.create({
  card: {
    borderRadius: SHEET.radius,
    borderWidth: 1,
    borderColor: MenuGlass.rim,
    backgroundColor: MenuGlass.card,
    overflow: "hidden",
    elevation: 16,
  },
  content: {
    padding: SHEET.pad - 1,
    gap: SHEET.gap,
  },
  pill: {
    minHeight: SHEET.pillHeight,
    borderRadius: SHEET.pillHeight / 2,
    backgroundColor: SHEET.pillFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  label: {
    color: MenuGlass.text,
    fontSize: 17,
    lineHeight: 22,
    textAlign: "center",
  },
});
