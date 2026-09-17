import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Keyboard,
  Platform,
  TouchableOpacity,
  View,
} from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { useHaptic } from "@/hooks/useHaptic";
import { verifyAccountPIN } from "@/utils/secureCredentials";
import { Button } from "./Button";
import { useConfirmDialog } from "./common/ConfirmDialog";
import {
  NeonSheet,
  NeonSheetNote,
  neonSheetModalProps,
} from "./common/NeonSheet";
import { Text } from "./common/Text";
import { PinInput } from "./inputs/PinInput";

interface PINEntryModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onForgotPIN?: () => void;
  serverUrl: string;
  userId: string;
  username: string;
}

export const PINEntryModal: React.FC<PINEntryModalProps> = ({
  visible,
  onClose,
  onSuccess,
  onForgotPIN,
  serverUrl,
  userId,
  username,
}) => {
  const { t } = useTranslation();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [pinCode, setPinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const errorHaptic = useHaptic("error");
  const successHaptic = useHaptic("success");
  const { confirm, dialog } = useConfirmDialog();

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["50%"]),
    [isAndroid],
  );

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
      setPinCode("");
      setError(null);
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setPinCode("");
        setError(null);
        onClose();
      }
    },
    [onClose],
  );

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 10,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePinChange = async (value: string) => {
    setPinCode(value);
    setError(null);

    // Auto-verify when 4 digits entered
    if (value.length === 4) {
      setIsVerifying(true);
      try {
        const isValid = await verifyAccountPIN(serverUrl, userId, value);
        if (isValid) {
          Keyboard.dismiss();
          successHaptic();
          onSuccess();
          setPinCode("");
        } else {
          errorHaptic();
          setError(t("pin.invalid_pin"));
          shake();
          setPinCode("");
        }
      } catch {
        errorHaptic();
        setError(t("pin.invalid_pin"));
        shake();
        setPinCode("");
      } finally {
        setIsVerifying(false);
      }
    }
  };

  const handleForgotPIN = () => {
    confirm({
      title: t("pin.forgot_pin"),
      message: t("pin.forgot_pin_desc"),
      confirmLabel: t("common.continue"),
      destructive: true,
      onConfirm: () => {
        onClose();
        onForgotPIN?.();
      },
    });
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
        title={t("pin.enter_pin")}
        onClose={onClose}
        primary={
          <Button onPress={onClose} variant='border' color='white'>
            {t("common.cancel")}
          </Button>
        }
      >
        <NeonSheetNote center>
          {t("pin.enter_pin_for", { username })}
        </NeonSheetNote>

        <Animated.View
          style={{
            transform: [{ translateX: shakeAnimation }],
            paddingHorizontal: 16,
            paddingTop: 12,
          }}
        >
          <PinInput
            value={pinCode}
            onChangeText={handlePinChange}
            length={4}
            autoFocus
          />
          {error && (
            <Text
              variant='caption'
              style={{
                color: NeonBoard.red,
                textAlign: "center",
                marginTop: 12,
              }}
            >
              {error}
            </Text>
          )}
          {isVerifying && (
            <Text
              variant='caption'
              muted
              style={{ textAlign: "center", marginTop: 12 }}
            >
              {t("common.verifying") || "Verifying..."}
            </Text>
          )}
        </Animated.View>

        <TouchableOpacity
          onPress={handleForgotPIN}
          accessibilityRole='button'
          style={{ paddingVertical: 16 }}
        >
          <View>
            <Text
              variant='button'
              accent={NeonBoard.volt}
              style={{ textAlign: "center" }}
            >
              {t("pin.forgot_pin")}
            </Text>
          </View>
        </TouchableOpacity>
        {dialog}
      </NeonSheet>
    </BottomSheetModal>
  );
};
