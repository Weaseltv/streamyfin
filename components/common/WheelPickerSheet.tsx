import { Host, Picker, Text as UIText } from "@expo/ui/swift-ui";
import {
  font,
  foregroundColor,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text as RNText, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { NeonSheet } from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Fonts } from "@/constants/neon";
import { useHaptic } from "@/hooks/useHaptic";
import { useAccent } from "@/utils/atoms/pageAccent";

export type WheelOption<Value extends string | number> = {
  value: Value;
  title: string;
};

type Props<Value extends string | number> = {
  title: string;
  options: WheelOption<Value>[];
  selection: Value;
  /** Called only on Done. Spinning past a value never applies it. */
  onCommit: (value: Value) => void;
  onClose: () => void;
  accent?: string;
};

/**
 * SwiftUI's `.pickerStyle(.wheel)` renders `UIPickerView` at a fixed natural
 * height and ignores the frame it is given — measured at ~216pt on iPhone.
 * Asking for more only centres it in dead space, so the host is sized to what
 * the control will actually draw.
 */
const WHEEL_HEIGHT = 216;
/**
 * The wheel's row height at the type size below — SwiftUI's wheel sizes rows
 * to their content, and the selection band has to match.
 */
const ROW_HEIGHT = 40;

/**
 * The one discrete-option control, matching WeaselTV iOS's `SelectionWheel`.
 *
 * Why a wheel and not a list: values move under a fixed indicator and each one
 * that snaps into place ticks. That per-step tick is the system's — it is
 * emitted by `UIPickerView` itself — which is the whole reason for choosing a
 * wheel; no amount of haptic wiring on a tap list produces it.
 *
 * Draft, then commit: the wheel edits a draft and applies it on Done. A
 * live-applying wheel would reload the season's episode list for every value
 * that passes under the indicator. Cancel (the X) leaves the original
 * untouched. This is the Clock app's grammar: spin, then Done.
 *
 * Android has no `UIPickerView`, so it draws the same wheel in React Native
 * (`AndroidWheel`) under the same Done and band: the iPhone's season picker
 * on Android too (owner, parity round 2, Q2).
 */
export function WheelPickerSheet<Value extends string | number>({
  title,
  options,
  selection,
  onCommit,
  onClose,
  accent: accentProp,
}: Props<Value>) {
  const accent = useAccent(accentProp);
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Value>(selection);

  const done = (
    <TouchableOpacity
      onPress={() => {
        onCommit(draft);
        onClose();
      }}
      hitSlop={8}
      accessibilityRole='button'
      style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
    >
      <Text variant='chip' style={{ color: accent, fontSize: 15 }}>
        {t("common.done")}
      </Text>
    </TouchableOpacity>
  );

  if (Platform.OS !== "ios") {
    return (
      <NeonSheet title={title} accent={accent} onClose={onClose} right={done}>
        <View style={{ height: WHEEL_HEIGHT }}>
          <AndroidWheel options={options} value={draft} onChange={setDraft} />
          <SelectionBand accent={accent} />
        </View>
      </NeonSheet>
    );
  }

  return (
    <NeonSheet title={title} accent={accent} onClose={onClose} right={done}>
      <View style={{ height: WHEEL_HEIGHT }}>
        <Host
          colorScheme='dark'
          style={{ height: WHEEL_HEIGHT }}
          matchContents={false}
        >
          <Picker
            selection={draft}
            onSelectionChange={(value) => setDraft(value as Value)}
            modifiers={[pickerStyle("wheel")]}
          >
            {options.map((option) => (
              <UIText
                key={String(option.value)}
                modifiers={[
                  tag(option.value),
                  // Larger than WeaselTV's 17/16 by request, and with a
                  // wider gap so the row that settles in the middle visibly
                  // steps up and the one scrolled past steps back down. The
                  // native wheel re-renders on settle, not continuously, so
                  // this is the enlarge-in-the-middle a UIPickerView can do.
                  font({
                    family: Fonts.body,
                    size: option.value === draft ? 24 : 19,
                    weight: option.value === draft ? "semibold" : "medium",
                  }),
                  foregroundColor(
                    option.value === draft ? NeonBoard.text : NeonBoard.mid,
                  ),
                ]}
              >
                {option.title}
              </UIText>
            ))}
          </Picker>
        </Host>
        <SelectionBand accent={accent} />
      </View>
    </NeonSheet>
  );
}

/**
 * The band over the selected row: accent at 10% with a 1px accent 60% rule
 * top and bottom, inset from the sides. Sits over the wheel and lets touches
 * through.
 */
function SelectionBand({ accent }: { accent: string }) {
  return (
    <View
      pointerEvents='none'
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        top: (WHEEL_HEIGHT - ROW_HEIGHT) / 2,
        height: ROW_HEIGHT,
        backgroundColor: `${accent}1A`,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: `${accent}99`,
      }}
    />
  );
}

/**
 * UIPickerView's geometry as drawn on the iPhone (r1 pair 32): 32pt rows on
 * a drum whose radius is half the 216pt wheel, so neighbours tilt away and
 * fade, the system's grey 32pt selection capsule 9pt in from the sheet's
 * sides, and a tick for every row that passes the middle.
 */
const DRUM_ROW = 32;
const DRUM_RADIUS = WHEEL_HEIGHT / 2;

function AndroidWheel<Value extends string | number>({
  options,
  value,
  onChange,
}: {
  options: WheelOption<Value>[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  const haptic = useHaptic("selection");
  const last = Math.max(0, options.length - 1);
  const initial = useRef(
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  ).current;
  const offset = useSharedValue(initial * DRUM_ROW);
  const start = useSharedValue(0);

  const settle = useCallback(
    (index: number) => {
      const option = options[index];
      if (option) onChange(option.value);
    },
    [options, onChange],
  );

  // A tick each time a new row reaches the middle, as UIPickerView does.
  useAnimatedReaction(
    () => Math.round(offset.value / DRUM_ROW),
    (index, previous) => {
      if (
        previous !== null &&
        index !== previous &&
        index >= 0 &&
        index <= last
      )
        runOnJS(haptic)();
    },
  );

  const snapTo = (index: number) => {
    "worklet";
    const target = Math.min(last, Math.max(0, index)) * DRUM_ROW;
    const distance = Math.abs(target - offset.value);
    offset.value = withTiming(
      target,
      {
        duration: Math.min(700, 160 + distance * 1.2),
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(settle)(Math.round(target / DRUM_ROW));
      },
    );
  };

  const pan = Gesture.Pan()
    // Take the drag before the sheet's own pan-to-close does.
    .activeOffsetY([-4, 4])
    .onBegin(() => {
      cancelAnimation(offset);
      start.value = offset.value;
    })
    .onUpdate((event) => {
      const max = last * DRUM_ROW;
      let next = start.value - event.translationY;
      // Rubber band past either end.
      if (next < 0) next /= 3;
      if (next > max) next = max + (next - max) / 3;
      offset.value = next;
    })
    .onEnd((event) => {
      // Fling: carry on for a quarter of a second's travel, then settle.
      snapTo(Math.round((offset.value - event.velocityY * 0.25) / DRUM_ROW));
    })
    .onFinalize((event, success) => {
      if (success) return;
      // A tap: bring the touched row to the middle.
      snapTo(
        Math.round(offset.value / DRUM_ROW) +
          Math.round((event.y - WHEEL_HEIGHT / 2) / DRUM_ROW),
      );
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ height: WHEEL_HEIGHT, overflow: "hidden" }}>
        <View
          pointerEvents='none'
          style={{
            position: "absolute",
            left: 9,
            right: 9,
            top: (WHEEL_HEIGHT - DRUM_ROW) / 2,
            height: DRUM_ROW,
            borderRadius: 15,
            backgroundColor: "rgba(118,118,128,0.24)",
          }}
        />
        {options.map((option, index) => (
          <DrumRow
            key={String(option.value)}
            index={index}
            offset={offset}
            title={option.title}
            selected={option.value === value}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

function DrumRow({
  index,
  offset,
  title,
  selected,
}: {
  index: number;
  offset: SharedValue<number>;
  title: string;
  selected: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const angle = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, (index * DRUM_ROW - offset.value) / DRUM_RADIUS),
    );
    const cos = Math.cos(angle);
    return {
      opacity: cos * cos,
      transform: [
        { translateY: DRUM_RADIUS * Math.sin(angle) },
        { perspective: 600 },
        { rotateX: `${-angle}rad` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          top: (WHEEL_HEIGHT - DRUM_ROW) / 2,
          height: DRUM_ROW,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {/* The settled row steps up to 24 semibold, the rest 19 medium, as
          the iOS wheel draws them. */}
      <RNText
        numberOfLines={1}
        allowFontScaling={false}
        style={{
          fontFamily: Fonts.body,
          fontSize: selected ? 24 : 19,
          fontWeight: selected ? "600" : "500",
          color: selected ? NeonBoard.text : NeonBoard.mid,
        }}
      >
        {title}
      </RNText>
    </Animated.View>
  );
}
