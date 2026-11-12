import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { useSetting } from "@/utils/atoms/settings";

const noHaptic = () => {};
const Haptics = !Platform.isTV ? require("expo-haptics") : null;

export type HapticFeedbackType =
  | "light"
  | "medium"
  | "heavy"
  | "selection"
  | "success"
  | "warning"
  | "error";

export const useHaptic = (feedbackType: HapticFeedbackType = "selection") => {
  const disableHapticFeedback = useSetting("disableHapticFeedback");
  const isTv = Platform.isTV;
  const isDisabled =
    isTv || !Haptics || disableHapticFeedback || Platform.OS === "web";

  const createHapticHandler = useCallback(
    (type: typeof Haptics.ImpactFeedbackStyle) => {
      if (!Haptics || !type) return () => {};
      return () => Haptics.impactAsync(type);
    },
    [],
  );

  const createNotificationFeedback = useCallback(
    (type: typeof Haptics.NotificationFeedbackType) => {
      if (!Haptics || !type) return () => {};
      return () => Haptics.notificationAsync(type);
    },
    [],
  );

  const hapticHandlers = useMemo(() => {
    if (!Haptics) {
      return {
        light: () => {},
        medium: () => {},
        heavy: () => {},
        selection: () => {},
        success: () => {},
        warning: () => {},
        error: () => {},
      };
    }

    return {
      light: createHapticHandler(Haptics.ImpactFeedbackStyle.Light),
      medium: createHapticHandler(Haptics.ImpactFeedbackStyle.Medium),
      heavy: createHapticHandler(Haptics.ImpactFeedbackStyle.Heavy),
      selection: Haptics.selectionAsync,
      success: createNotificationFeedback(
        Haptics.NotificationFeedbackType.Success,
      ),
      warning: createNotificationFeedback(
        Haptics.NotificationFeedbackType.Warning,
      ),
      error: createNotificationFeedback(Haptics.NotificationFeedbackType.Error),
    };
  }, [createHapticHandler, createNotificationFeedback]);

  if (disableHapticFeedback) {
    return noHaptic;
  }
  return isDisabled ? noHaptic : hapticHandlers[feedbackType];
};
