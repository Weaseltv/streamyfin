import { useCallback, useRef } from "react";
import { useHaptic } from "@/hooks/useHaptic";
import { useOrientation } from "@/hooks/useOrientation";
import { OrientationLock } from "@/packages/expo-screen-orientation";

/** The old Android rotate button, now the "…" menu's Rotate entry. */
export const useRotatePlayer = () => {
  const lightHapticFeedback = useHaptic("light");
  const { orientation, lockOrientation } = useOrientation();
  const busy = useRef(false);

  return useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    lightHapticFeedback();
    try {
      const isPortrait =
        orientation === OrientationLock.PORTRAIT_UP ||
        orientation === OrientationLock.PORTRAIT_DOWN;
      await lockOrientation(
        isPortrait ? OrientationLock.LANDSCAPE : OrientationLock.PORTRAIT_UP,
      );
    } finally {
      busy.current = false;
    }
  }, [orientation, lockOrientation, lightHapticFeedback]);
};
