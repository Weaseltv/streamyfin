import type { Feather } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import type { AccountSecurityType } from "@/utils/secureCredentials";
import { Button } from "./Button";
import {
  NeonSheet,
  NeonSheetNote,
  NeonSheetRow,
  neonSheetModalProps,
} from "./common/NeonSheet";
import { Text } from "./common/Text";
import { PinInput } from "./inputs/PinInput";

interface SaveAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (securityType: AccountSecurityType, pinCode?: string) => void;
  username: string;
}

interface SecurityOption {
  type: AccountSecurityType;
  titleKey: string;
  descriptionKey: string;
  icon: keyof typeof Feather.glyphMap;
}

const SECURITY_OPTIONS: SecurityOption[] = [
  {
    type: "none",
    titleKey: "save_account.no_protection",
    descriptionKey: "save_account.no_protection_desc",
    icon: "zap",
  },
  {
    type: "pin",
    titleKey: "save_account.pin_code",
    descriptionKey: "save_account.pin_code_desc",
    icon: "hash",
  },
  {
    type: "password",
    titleKey: "save_account.password",
    descriptionKey: "save_account.password_desc",
    icon: "lock",
  },
];

export const SaveAccountModal: React.FC<SaveAccountModalProps> = ({
  visible,
  onClose,
  onSave,
  username,
}) => {
  const { t } = useTranslation();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const [selectedType, setSelectedType] = useState<AccountSecurityType>("none");
  const [pinCode, setPinCode] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["70%"]),
    [isAndroid],
  );

  const isPresentedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
    } else if (isPresentedRef.current) {
      bottomSheetModalRef.current?.dismiss();
      isPresentedRef.current = false;
    }
  }, [visible]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index >= 0) {
        isPresentedRef.current = true;
      } else if (index === -1 && isPresentedRef.current) {
        isPresentedRef.current = false;
        resetState();
        onClose();
      }
    },
    [onClose],
  );

  const resetState = () => {
    setSelectedType("none");
    setPinCode("");
    setPinError(null);
  };

  const handleOptionSelect = (type: AccountSecurityType) => {
    setSelectedType(type);
    setPinCode("");
    setPinError(null);
  };

  const handleSave = () => {
    if (selectedType === "pin") {
      if (pinCode.length !== 4) {
        setPinError(t("pin.enter_4_digits") || "Enter 4 digits");
        return;
      }
      onSave("pin", pinCode);
    } else {
      onSave(selectedType);
    }
    resetState();
  };

  const handleCancel = () => {
    resetState();
    onClose();
  };

  const canSave = () => {
    if (selectedType === "pin") {
      return pinCode.length === 4;
    }
    return true;
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
        title={t("save_account.title")}
        onClose={handleCancel}
        primary={
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button
              onPress={handleCancel}
              variant='border'
              color='white'
              style={{ flex: 1 }}
            >
              {t("save_account.cancel_button")}
            </Button>
            <Button
              onPress={handleSave}
              color='primary'
              style={{ flex: 1 }}
              disabled={!canSave()}
            >
              {t("save_account.save_button")}
            </Button>
          </View>
        }
      >
        {selectedType === "pin" ? (
          <View>
            <NeonSheetNote center>{t("pin.setup_pin")}</NeonSheetNote>
            <PinInput
              value={pinCode}
              onChangeText={setPinCode}
              length={4}
              style={{ paddingHorizontal: 16, marginTop: 12 }}
              autoFocus
            />
            {pinError && (
              <Text
                variant='caption'
                style={{
                  color: NeonBoard.red,
                  textAlign: "center",
                  marginTop: 12,
                }}
              >
                {pinError}
              </Text>
            )}
          </View>
        ) : (
          <View>
            <NeonSheetNote>{t("save_account.security_option")}</NeonSheetNote>
            {SECURITY_OPTIONS.map((option) => (
              <NeonSheetRow
                key={option.type}
                label={t(option.titleKey)}
                subtitle={t(option.descriptionKey)}
                icon={option.icon}
                selected={selectedType === option.type}
                onPress={() => handleOptionSelect(option.type)}
              />
            ))}
          </View>
        )}
      </NeonSheet>
    </BottomSheetModal>
  );
};
