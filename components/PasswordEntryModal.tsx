import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { FontFace } from "@/constants/neon";
import { useHaptic } from "@/hooks/useHaptic";
import { Button } from "./Button";
import {
  NeonSheet,
  NeonSheetNote,
  neonSheetModalProps,
} from "./common/NeonSheet";
import { Text } from "./common/Text";

interface PasswordEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
  username: string;
}

export const PasswordEntryModal: React.FC<PasswordEntryModalProps> = ({
  visible,
  onClose,
  onSubmit,
  username,
}) => {
  const { t } = useTranslation();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const errorHaptic = useHaptic("error");

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["50%"]),
    [isAndroid],
  );

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
      setPassword("");
      setError(null);
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setPassword("");
        setError(null);
        onClose();
      }
    },
    [onClose],
  );

  const handleSubmit = async () => {
    if (!password) {
      setError(t("password.enter_password"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSubmit(password);
      setPassword("");
    } catch {
      errorHaptic();
      setError(t("password.invalid_password"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      {...neonSheetModalProps}
      keyboardBehavior={isAndroid ? "fillParent" : "interactive"}
      keyboardBlurBehavior='restore'
      android_keyboardInputMode='adjustResize'
      topInset={isAndroid ? 0 : undefined}
    >
      <NeonSheet
        fill
        eyebrow={username}
        title={t("password.enter_password")}
        onClose={onClose}
        primary={
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              onPress={onClose}
              variant='border'
              color='white'
              style={{ flex: 1 }}
              disabled={isLoading}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onPress={handleSubmit}
              color='primary'
              style={{ flex: 1 }}
              disabled={isLoading || !password}
              loading={isLoading}
            >
              {t("common.login")}
            </Button>
          </View>
        }
      >
        <NeonSheetNote>
          {t("password.enter_password_for", { username })}
        </NeonSheetNote>

        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <BottomSheetTextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("login.password_placeholder")}
            placeholderTextColor={NeonBoard.low}
            secureTextEntry
            autoFocus
            autoCapitalize='none'
            autoCorrect={false}
            style={{
              backgroundColor: NeonBoard.card2,
              borderWidth: 1,
              borderColor: focused ? NeonBoard.volt : NeonBoard.line2,
              borderRadius: 0,
              color: NeonBoard.text,
              paddingHorizontal: 14,
              minHeight: 48,
              ...FontFace.bodySemi,
              fontSize: 15,
            }}
            onSubmitEditing={handleSubmit}
            returnKeyType='done'
          />
          {error && (
            <Text
              variant='caption'
              style={{ color: NeonBoard.red, marginTop: 8 }}
            >
              {error}
            </Text>
          )}
        </View>
      </NeonSheet>
    </BottomSheetModal>
  );
};
