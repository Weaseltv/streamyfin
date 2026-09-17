import { useActionSheet } from "@expo/react-native-action-sheet";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform } from "react-native";

interface ConfirmDeleteOptions {
  /** Heading for the prompt, usually the name of what is being deleted. */
  title?: string;
  /** Supporting copy explaining what the delete removes. */
  message?: string;
  /** Label for the destructive button. Defaults to `common.delete`. */
  confirmLabel?: string;
  onConfirm: () => void;
}

export interface ConfirmDeleteRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/** The pending prompt, rendered by `ConfirmDeleteHost` as the P14 dialog. */
export const confirmDeleteRequestAtom = atom<ConfirmDeleteRequest | null>(null);

/** Ids of the mounted `ConfirmDeleteHost`s; the last one draws, none = action sheet. */
export const confirmDeleteHostsAtom = atom<string[]>([]);

/**
 * Single entry point for "are you sure?" prompts on destructive actions, so
 * every delete in the app gets the same buttons in the same order.
 *
 * On phones the prompt is the Neon Board confirm dialog (red tally, CANCEL /
 * DELETE row) when a `ConfirmDeleteHost` is mounted on the page; without one
 * it keeps the native action sheet. TV gets an Alert - action sheets and the
 * dialog can't be navigated with a remote. Feedback on the result (haptics,
 * toasts) is left to the caller, which is the only one that knows whether
 * the delete worked.
 */
export const useConfirmDelete = () => {
  const { t } = useTranslation();
  const { showActionSheetWithOptions } = useActionSheet();
  const setRequest = useSetAtom(confirmDeleteRequestAtom);
  const hosts = useAtomValue(confirmDeleteHostsAtom);
  const hasHost = hosts.length > 0;

  return useCallback(
    ({ title, message, confirmLabel, onConfirm }: ConfirmDeleteOptions) => {
      const confirmText = confirmLabel ?? t("common.delete");
      const cancelText = t("common.cancel");

      if (Platform.isTV) {
        Alert.alert(title ?? confirmText, message, [
          { text: cancelText, style: "cancel" },
          { text: confirmText, style: "destructive", onPress: onConfirm },
        ]);
        return;
      }

      if (hasHost) {
        setRequest({
          title: title ?? confirmText,
          message,
          confirmLabel: confirmText,
          cancelLabel: cancelText,
          onConfirm,
        });
        return;
      }

      showActionSheetWithOptions(
        {
          title,
          message,
          options: [confirmText, cancelText],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        (selectedIndex) => {
          if (selectedIndex === 0) onConfirm();
        },
      );
    },
    [t, showActionSheetWithOptions, setRequest, hasHost],
  );
};
