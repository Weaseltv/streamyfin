import { Feather } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { requireOptionalNativeModule } from "expo-modules-core";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { toast } from "sonner-native";
import { NeonBoard } from "@/constants/Colors";
import { glowChip } from "@/constants/neon";
import { Button } from "../Button";
import {
  NeonSheet,
  NeonSheetNote,
  neonSheetModalProps,
} from "../common/NeonSheet";
import { Text } from "../common/Text";

interface Props {
  /** The Quick Connect code to display, or null when hidden. */
  code: string | null;
  onClose: () => void;
}

/**
 * Shows the Quick Connect code while the app polls for authorization.
 * In-app sheet instead of a native Alert so it can dismiss itself once the
 * session is authorized — a native alert has no programmatic dismiss and
 * lingers over the app after login completes.
 */
export const QuickConnectCodeModal: React.FC<Props> = ({ code, onClose }) => {
  const { t } = useTranslation();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["50%"], []);
  const isPresentedRef = useRef(false);

  // Keep the last code around so the dismiss animation doesn't flash empty
  // when the parent clears the code to close the sheet.
  const lastCodeRef = useRef<string | null>(null);
  if (code) lastCodeRef.current = code;

  useEffect(() => {
    if (code) {
      bottomSheetModalRef.current?.present();
    } else if (isPresentedRef.current) {
      bottomSheetModalRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [code]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index >= 0) {
        isPresentedRef.current = true;
      } else if (index === -1 && isPresentedRef.current) {
        isPresentedRef.current = false;
        onClose();
      }
    },
    [onClose],
  );

  const copyCode = useCallback(async () => {
    const value = code ?? lastCodeRef.current;
    if (!value) return;
    // Builds that don't ship the expo-clipboard native module yet: probe with
    // requireOptionalNativeModule (returns null instead of throwing/logging)
    // and skip — importing the JS wrapper there would error out.
    if (!requireOptionalNativeModule("ExpoClipboard")) return;
    const Clipboard = await import("expo-clipboard");
    await Clipboard.setStringAsync(value);
    toast.success(t("login.code_copied"));
  }, [code, t]);

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      {...neonSheetModalProps}
    >
      <NeonSheet
        fill
        eyebrow={t("login.quick_connect")}
        title={t("login.your_code")}
        onClose={onClose}
        primary={
          <Button color='primary' onPress={onClose}>
            {t("login.got_it")}
          </Button>
        }
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          {/* The code is the hero: a card2 box with a volt border and glow. */}
          <TouchableOpacity
            onPress={copyCode}
            activeOpacity={0.8}
            accessibilityRole='button'
            accessibilityLabel={t("login.tap_code_to_copy")}
            style={[
              {
                backgroundColor: NeonBoard.card2,
                borderWidth: 1,
                borderColor: NeonBoard.volt,
                borderRadius: 0,
                paddingVertical: 22,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              },
              glowChip(NeonBoard.volt),
            ]}
          >
            <Text
              variant='display'
              allowFontScaling={false}
              style={{ letterSpacing: 8, textAlign: "center" }}
            >
              {code ?? lastCodeRef.current}
            </Text>
            <Feather
              name='copy'
              size={20}
              color={NeonBoard.mid}
              style={{ marginLeft: 12 }}
            />
          </TouchableOpacity>
        </View>
        <NeonSheetNote center>{t("login.tap_code_to_copy")}</NeonSheetNote>
        <NeonSheetNote center style={{ paddingTop: 4 }}>
          {t("login.quick_connect_instructions")}
        </NeonSheetNote>
      </NeonSheet>
    </BottomSheetModal>
  );
};
