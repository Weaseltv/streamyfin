import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { getQuickConnectApi } from "@jellyfin/sdk/lib/utils/api";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
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
import { useHaptic } from "@/hooks/useHaptic";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { Button } from "../Button";
import {
  NeonSheet,
  NeonSheetNote,
  neonSheetModalProps,
} from "../common/NeonSheet";
import { Text } from "../common/Text";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

const CODE_LENGTH = 6;
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
  accent = NeonBoard.volt,
  ...props
}) => {
  const isTv = Platform.isTV;
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [quickConnectCode, setQuickConnectCode] = useState<string>();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");
  const snapPoints = useMemo(
    () => (Platform.OS === "android" ? ["100%"] : ["50%"]),
    [],
  );
  const isAndroid = Platform.OS === "android";

  const { t } = useTranslation();

  const authorizeQuickConnect = useCallback(async () => {
    if (quickConnectCode) {
      try {
        const res = await getQuickConnectApi(api!).authorizeQuickConnect({
          code: quickConnectCode,
          userId: user?.Id,
        });
        if (res.status === 200) {
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
      } catch (_e) {
        errorHapticFeedback();
        Alert.alert(
          t("home.settings.quick_connect.error"),
          t("home.settings.quick_connect.invalid_code"),
        );
      }
    }
  }, [api, user, quickConnectCode]);

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
            // Reset the code when opening the sheet
            setQuickConnectCode("");
            bottomSheetModalRef?.current?.present();
          }}
          icon='qr-code-outline'
          title={t("pairing.pair_with_phone_title")}
          value={t("home.settings.quick_connect.enter_a_code")}
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
        <NeonSheet
          fill
          eyebrow={eyebrow}
          title={t("home.settings.quick_connect.enter_the_code")}
          accent={accent}
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
          <Pressable
            onPress={pasteCode}
            hitSlop={8}
            accessibilityRole='button'
            style={{
              alignSelf: "center",
              marginTop: 16,
              paddingHorizontal: Sizes.gutter,
            }}
          >
            <Text variant='tally' accent={accent}>
              {t("home.settings.quick_connect.paste_code")}
            </Text>
          </Pressable>
        </NeonSheet>
      </BottomSheetModal>
    </View>
  );
};
