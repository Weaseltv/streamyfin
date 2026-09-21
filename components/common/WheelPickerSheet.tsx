import { Host, Picker, Text as UIText } from "@expo/ui/swift-ui";
import {
  font,
  foregroundColor,
  pickerStyle,
  tag,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { NeonSheet, NeonSheetRow } from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Fonts } from "@/constants/neon";
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
/** `UIPickerView`'s default row height, which the selection band must match. */
const ROW_HEIGHT = 32;

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
 * Android has no `UIPickerView`; it gets the same sheet as a tap list, which
 * commits immediately because there is no spin to defer.
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
      <NeonSheet scroll title={title} accent={accent} onClose={onClose}>
        {options.map((option) => (
          <NeonSheetRow
            key={String(option.value)}
            label={option.title}
            accent={accent}
            selected={option.value === selection}
            onPress={() => {
              onCommit(option.value);
              onClose();
            }}
          />
        ))}
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
                  // Barlow SemiBold 17 on the selected row, Medium 16
                  // elsewhere — the wheel dims and foreshortens the rest.
                  font({
                    family: Fonts.body,
                    size: option.value === draft ? 17 : 16,
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
        {/* The band over the selected row: accent at 10% with a 1px accent
            60% rule top and bottom, inset from the sides. Sits over the
            wheel and lets touches through. */}
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
      </View>
    </NeonSheet>
  );
}
