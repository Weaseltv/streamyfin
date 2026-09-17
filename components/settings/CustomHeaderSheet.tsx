import { Feather } from "@expo/vector-icons";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, View } from "react-native";
import { Button } from "@/components/Button";
import {
  NeonSheet,
  NeonSheetNote,
  NeonSheetRow,
} from "@/components/common/NeonSheet";
import { NeonBoard } from "@/constants/Colors";
import {
  type CustomHeader,
  HEADER_PRESETS,
  type HeaderPreset,
  presetRows,
} from "@/utils/customHeaders";
import { CustomHeaderList } from "./CustomHeaderList";

interface CustomHeaderSheetProps {
  /** The sheet owns its rows from here on — GlobalModal snapshots content. */
  initialHeaders: CustomHeader[];
  /** Mirrors every edit back to the owner, so a swipe-to-dismiss keeps them. */
  onChange?: (headers: CustomHeader[]) => void;
  /**
   * Persist the final rows, once. Fired when the sheet goes away — by the
   * button or by a swipe — so a saved server isn't rewritten (Keychain, and
   * every cached header with it) on each keystroke.
   */
  onCommit?: (headers: CustomHeader[]) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet editor for the custom proxy auth headers, used from the login
 * screen where there is no settings page to put them on.
 *
 * Presets are a second view inside the same sheet rather than another modal:
 * GlobalModal holds one sheet at a time, so replacing its content would lose
 * the rows the user has already typed.
 */
export function CustomHeaderSheet({
  initialHeaders,
  onChange,
  onCommit,
  onClose,
}: CustomHeaderSheetProps): React.ReactElement {
  const { t } = useTranslation();

  const [headers, setHeaders] = useState<CustomHeader[]>(initialHeaders);
  const [showPresets, setShowPresets] = useState(false);

  // The app draws edge to edge, so Android never resizes the window for the
  // keyboard and `adjustResize` does nothing: the sheet keeps its height and
  // the lower fields sit under the keyboard with nothing to scroll to. Padding
  // the scroll content by the keyboard's height gives them somewhere to go.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardHeight(0),
    );

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Read on the way out, so the commit sees the last edit rather than the rows
  // captured when the effect was set up.
  const latestHeaders = useRef(initialHeaders);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(
    () => () => {
      commitRef.current?.(latestHeaders.current);
    },
    [],
  );

  const update = (next: CustomHeader[]) => {
    latestHeaders.current = next;
    setHeaders(next);
    onChange?.(next);
  };

  const applyPreset = (preset: HeaderPreset) => {
    update([...headers, ...presetRows(preset)]);
    setShowPresets(false);
  };

  if (showPresets) {
    return (
      <NeonSheet
        scroll
        extraBottom={keyboardHeight}
        eyebrow={t("custom_headers.title")}
        title={t("custom_headers.presets_title")}
        onBack={() => setShowPresets(false)}
        onClose={onClose}
      >
        {HEADER_PRESETS.map((preset) => (
          <NeonSheetRow
            key={preset.id}
            label={preset.label}
            subtitle={preset.description}
            onPress={() => applyPreset(preset)}
            right={<Feather name='plus' size={20} color={NeonBoard.volt} />}
          />
        ))}
      </NeonSheet>
    );
  }

  return (
    <NeonSheet
      scroll
      extraBottom={keyboardHeight}
      title={t("custom_headers.title")}
      onClose={onClose}
      primary={<Button onPress={onClose}>{t("custom_headers.done")}</Button>}
    >
      <NeonSheetNote>{t("custom_headers.description")}</NeonSheetNote>

      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        <CustomHeaderList
          headers={headers}
          onChange={update}
          onCommit={update}
          onAddPreset={() => setShowPresets(true)}
        />
      </View>

      <NeonSheetNote>{t("custom_headers.security_note")}</NeonSheetNote>
    </NeonSheet>
  );
}
