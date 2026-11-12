import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Platform,
  Pressable,
  type TextInput,
  View,
  type ViewProps,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { glowChip, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useAccent } from "@/utils/atoms/pageAccent";
import { quickConnectCodeEntryRequestAtom } from "@/utils/atoms/quickConnect";
import {
  authorizeQuickConnectCode,
  QUICK_CONNECT_CODE_LENGTH as CODE_LENGTH,
} from "@/utils/quickConnect/code";
import { Button } from "../Button";
import {
  NeonSheet,
  NeonSheetNote,
  neonSheetModalProps,
} from "../common/NeonSheet";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const CELL_W = 46;
const CELL_H = 60;

/**
 * Six 46×60 `card2` cells driven by a hidden text input: filled cells take
 * a volt border with a glow, the digits are Condensed 800 30.
 */
const CodeCells: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  accent: string;
}> = ({ value, onChangeText, accent }) => {
  const inputRef = useRef<TextInput>(null);
  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      accessibilityRole='none'
      style={{ alignItems: "center" }}
    >
      <BottomSheetTextInput
        ref={inputRef as any}
        value={value}
        onChangeText={(text) =>
          onChangeText(text.replace(/\D/g, "").slice(0, CODE_LENGTH))
        }
        keyboardType='number-pad'
        maxLength={CODE_LENGTH}
        autoFocus
        style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const digit = value[i];
          const filled = Boolean(digit);
          return (
            <View
              key={i}
              style={[
                {
                  width: CELL_W,
                  height: CELL_H,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: NeonBoard.card2,
                  borderWidth: 1,
                  borderColor: filled ? accent : NeonBoard.line2,
                },
                filled ? glowChip(accent) : null,
              ]}
            >
              <Text variant='display' allowFontScaling={false}>
                {digit ?? ""}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
};

interface Props extends ViewProps {
  accent?: string;
}

export const QuickConnect: React.FC<Props> = ({
  accent: accentProp,
  ...props
}) => {
  const accent = useAccent(accentProp);
  const isTv = Platform.isTV;
  const router = useRouter();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [quickConnectCode, setQuickConnectCode] = useState<string>();
  // Scanning the TV's QR code is the primary path; typing the six digits is
  // the fallback behind a link.
  const [mode, setMode] = useState<"scan" | "code">("scan");
  const [codeEntryRequested, setCodeEntryRequested] = useAtom(
    quickConnectCodeEntryRequestAtom,
  );
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  // The scan screen's "type the code instead" pops back here; reopen on the
  // code step once the pop has settled.
  useEffect(() => {
    if (!codeEntryRequested) return;
    const handle = setTimeout(() => {
      setCodeEntryRequested(false);
      setQuickConnectCode("");
      setMode("code");
      bottomSheetModalRef.current?.present();
    }, 300);
    return () => clearTimeout(handle);
  }, [codeEntryRequested, setCodeEntryRequested]);
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");
  const snapPoints = useMemo(
    () => (Platform.OS === "android" ? ["100%"] : ["50%"]),
    [],
  );
  const isAndroid = Platform.OS === "android";

  const { t } = useTranslation();

  const authorizeQuickConnect = useCallback(async () => {
    if (!quickConnectCode || !api) return;
    const ok = await authorizeQuickConnectCode(api, user?.Id, quickConnectCode);
    if (ok) {
      successHapticFeedback();
      Alert.alert(
        t("home.settings.quick_connect.success"),
        t("home.settings.quick_connect.quick_connect_authorized"),
      );
      setQuickConnectCode(undefined);
      bottomSheetModalRef?.current?.close();
    } else {
      errorHapticFeedback();
      Alert.alert(
        t("home.settings.quick_connect.error"),
        t("home.settings.quick_connect.invalid_code"),
      );
    }
  }, [
    api,
    user?.Id,
    quickConnectCode,
    successHapticFeedback,
    errorHapticFeedback,
    t,
  ]);

  const openScanner = useCallback(() => {
    // The sheet would sit on top of the camera otherwise.
    bottomSheetModalRef.current?.dismiss();
    router.push("/(auth)/(tabs)/(home)/quick-connect-scan");
  }, [router]);

  const pasteCode = useCallback(async () => {
    // Builds without the expo-clipboard native module: probe first (no-op).
    if (!requireOptionalNativeModule("ExpoClipboard")) return;
    const Clipboard = await import("expo-clipboard");
    const text = await Clipboard.getStringAsync();
    const digits = (text || "").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (digits) setQuickConnectCode(digits);
  }, []);

  if (isTv) return null;

  const eyebrow = `${t("home.settings.quick_connect.quick_connect_title")} · ${t(
    "pairing.pair_with_phone_title",
  )}`;

  return (
    <View {...props}>
      <ListGroup
        title={t("home.settings.quick_connect.quick_connect_title")}
        accent={accent}
      >
        <ListItem
          onPress={() => {
            // Reset to the scan step with an empty code when opening the sheet
            setQuickConnectCode("");
            setMode("scan");
            bottomSheetModalRef?.current?.present();
          }}
          icon='qr-code-outline'
          title={t("pairing.pair_with_phone_title")}
          value={t("home.settings.quick_connect.scan_qr")}
          showArrow
        />
      </ListGroup>

      <BottomSheetModal
        ref={bottomSheetModalRef}
        snapPoints={snapPoints}
        {...neonSheetModalProps}
        keyboardBehavior={isAndroid ? "fillParent" : "interactive"}
        keyboardBlurBehavior='restore'
        android_keyboardInputMode='adjustResize'
        topInset={isAndroid ? 0 : undefined}
      >
        {mode === "scan" ? (
          <NeonSheet
            fill
            eyebrow={eyebrow}
            title={t("home.settings.quick_connect.scan_the_qr_code")}
            accent={accent}
            onClose={() => bottomSheetModalRef.current?.close()}
            primary={
              <Button
                onPress={openScanner}
                accent={accent}
                iconLeft={
                  <Feather name='camera' size={18} color={NeonBoard.onAccent} />
                }
              >
                {t("home.settings.quick_connect.scan_qr")}
              </Button>
            }
          >
            <NeonSheetNote center style={{ paddingBottom: 8 }}>
              {t("home.settings.quick_connect.scan_hint")}
            </NeonSheetNote>
            <Pressable
              onPress={() => setMode("code")}
              hitSlop={8}
              accessibilityRole='button'
              style={{
                alignSelf: "center",
                marginTop: 8,
                paddingHorizontal: Sizes.gutter,
              }}
            >
              <Text variant='tally' accent={accent}>
                {t("home.settings.quick_connect.type_code_instead")}
              </Text>
            </Pressable>
          </NeonSheet>
        ) : (
          <NeonSheet
            fill
            eyebrow={eyebrow}
            title={t("home.settings.quick_connect.enter_the_code")}
            accent={accent}
            onBack={() => setMode("scan")}
            onClose={() => bottomSheetModalRef.current?.close()}
            primary={
              <Button
                onPress={authorizeQuickConnect}
                accent={accent}
                disabled={(quickConnectCode?.length ?? 0) < CODE_LENGTH}
                iconLeft={
                  <Feather
                    name='check-circle'
                    size={18}
                    color={
                      (quickConnectCode?.length ?? 0) < CODE_LENGTH
                        ? NeonBoard.low
                        : NeonBoard.onAccent
                    }
                  />
                }
              >
                {t("home.settings.quick_connect.authorize")}
              </Button>
            }
          >
            <NeonSheetNote center style={{ paddingBottom: 18 }}>
              {t("home.settings.quick_connect.enter_the_quick_connect_code")}
            </NeonSheetNote>
            <CodeCells
              value={quickConnectCode || ""}
              onChangeText={setQuickConnectCode}
              accent={accent}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 24,
                marginTop: 16,
                paddingHorizontal: Sizes.gutter,
              }}
            >
              <Pressable
                onPress={pasteCode}
                hitSlop={8}
                accessibilityRole='button'
              >
                <Text variant='tally' accent={accent}>
                  {t("home.settings.quick_connect.paste_code")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode("scan")}
                hitSlop={8}
                accessibilityRole='button'
              >
                <Text variant='tally' muted>
                  {t("home.settings.quick_connect.scan_instead")}
                </Text>
              </Pressable>
            </View>
          </NeonSheet>
        )}
      </BottomSheetModal>
    </View>
  );
};
