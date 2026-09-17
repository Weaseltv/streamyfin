import { Feather } from "@expo/vector-icons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import {
  deleteAccountCredential,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
import { serverHost } from "@/utils/serverHost";
import { Button } from "./Button";
import { useConfirmDialog } from "./common/ConfirmDialog";
import {
  NeonSheet,
  NeonSheetNote,
  neonSheetModalProps,
} from "./common/NeonSheet";
import { Text } from "./common/Text";

interface AccountsSheetProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  server: SavedServer | null;
  onAccountSelect: (account: SavedServerAccount) => void;
  onAddAccount: () => void;
  onAccountDeleted?: () => void;
}

export const AccountsSheet: React.FC<AccountsSheetProps> = ({
  open,
  setOpen,
  server,
  onAccountSelect,
  onAddAccount,
  onAccountDeleted,
}) => {
  const { t } = useTranslation();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { confirm, dialog } = useConfirmDialog();

  const isAndroid = Platform.OS === "android";
  const snapPoints = useMemo(
    () => (isAndroid ? ["100%"] : ["50%"]),
    [isAndroid],
  );

  useEffect(() => {
    if (open) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [open]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const handleDeleteAccount = async (account: SavedServerAccount) => {
    if (!server) return;

    confirm({
      title: t("server.remove_saved_login"),
      message: t("server.remove_account_description", {
        username: account.username,
      }),
      confirmLabel: t("common.remove"),
      destructive: true,
      onConfirm: async () => {
        await deleteAccountCredential(server.address, account.userId);
        onAccountDeleted?.();
      },
    });
  };

  const getSecurityIcon = (
    securityType: SavedServerAccount["securityType"],
  ): keyof typeof Feather.glyphMap => {
    switch (securityType) {
      case "pin":
        return "hash";
      case "password":
        return "lock";
      default:
        return "key";
    }
  };

  const renderRightActions = (account: SavedServerAccount) => (
    <TouchableOpacity
      onPress={() => handleDeleteAccount(account)}
      accessibilityRole='button'
      accessibilityLabel={t("common.remove")}
      style={{
        backgroundColor: NeonBoard.red,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 20,
      }}
    >
      <Feather name='trash-2' size={20} color={NeonBoard.text} />
    </TouchableOpacity>
  );

  if (!server) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      snapPoints={snapPoints}
      onChange={handleSheetChanges}
      {...neonSheetModalProps}
    >
      <NeonSheet
        fill
        eyebrow={server.name || serverHost(server.address)}
        title={t("server.select_account")}
        onClose={() => setOpen(false)}
        primary={
          <Button
            onPress={() => {
              setOpen(false);
              onAddAccount();
            }}
            color='primary'
            iconLeft={
              <Feather name='plus' size={18} color={NeonBoard.onAccent} />
            }
          >
            {t("server.add_account")}
          </Button>
        }
      >
        {server.accounts.map((account) => (
          <Swipeable
            key={account.userId}
            renderRightActions={() => renderRightActions(account)}
            overshootRight={false}
          >
            <TouchableOpacity
              onPress={() => {
                setOpen(false);
                onAccountSelect(account);
              }}
              activeOpacity={0.7}
              accessibilityRole='button'
              style={{
                minHeight: 52,
                paddingVertical: 8,
                paddingLeft: Sizes.rowLead,
                paddingRight: Sizes.gutter,
                flexDirection: "row",
                alignItems: "center",
                borderBottomWidth: 1,
                borderBottomColor: NeonBoard.line,
                backgroundColor: NeonBoard.card,
              }}
            >
              {/* People avatar: the one round shape on the panel. */}
              <View
                className='rounded-full'
                style={{
                  width: 36,
                  height: 36,
                  backgroundColor: NeonBoard.card2,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 12,
                }}
              >
                <Feather name='user' size={18} color={NeonBoard.mid} />
              </View>

              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text variant='rowTitle' numberOfLines={1}>
                  {account.username}
                </Text>
                <Text variant='meta' muted style={{ marginTop: 2 }}>
                  {account.securityType === "none"
                    ? t("save_account.no_protection")
                    : account.securityType === "pin"
                      ? t("save_account.pin_code")
                      : t("save_account.password")}
                </Text>
              </View>

              <Feather
                name={getSecurityIcon(account.securityType)}
                size={18}
                color={NeonBoard.volt}
              />
            </TouchableOpacity>
          </Swipeable>
        ))}

        <NeonSheetNote>{t("server.swipe_to_remove")}</NeonSheetNote>
        {dialog}
      </NeonSheet>
    </BottomSheetModal>
  );
};
