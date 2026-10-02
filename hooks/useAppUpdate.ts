import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import AppUpdater, { type UpdateCheckResult } from "@/modules/app-updater";
import {
  isUpdatePromptDue,
  UPDATE_PROMPT_SHOWN_AT_KEY,
} from "@/utils/appUpdate";
import {
  appUpdateCheckAtom,
  appUpdatePromptAtom,
} from "@/utils/atoms/appUpdate";
import { writeErrorLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";

/**
 * Update checks for the WeaselPlex Android phone app. Null `AppUpdater` (iOS, TV,
 * unlinked) makes every call a no-op. The popup itself is AppUpdatePrompt.
 */
export const useAppUpdate = () => {
  const [check, setCheck] = useAtom(appUpdateCheckAtom);
  const setPrompt = useSetAtom(appUpdatePromptAtom);

  const runCheck = useCallback(async (): Promise<UpdateCheckResult | null> => {
    if (!AppUpdater) return null;
    setCheck({ kind: "checking" });
    try {
      const result = await AppUpdater.checkForUpdate();
      if (result.status === "available") {
        setCheck({ kind: "available", versionName: result.versionName });
      } else if (result.status === "unsupported") {
        setCheck({ kind: "unsupported" });
      } else {
        setCheck({ kind: "upToDate" });
      }
      return result;
    } catch (error) {
      writeErrorLog(`Update check failed: ${(error as Error)?.message}`);
      setCheck({ kind: "error" });
      return null;
    }
  }, [setCheck]);

  /** On open: offer an update at most once every 12 hours. */
  const checkOnOpen = useCallback(async () => {
    if (!AppUpdater) return;
    if (
      !isUpdatePromptDue(
        storage.getNumber(UPDATE_PROMPT_SHOWN_AT_KEY),
        Date.now(),
      )
    ) {
      return;
    }
    const result = await runCheck();
    if (result?.status === "available") {
      storage.set(UPDATE_PROMPT_SHOWN_AT_KEY, Date.now());
      setPrompt({ versionName: result.versionName, percent: null });
    }
  }, [runCheck, setPrompt]);

  /** From Settings: check now, and offer the update straight away if there is one. */
  const checkNow = useCallback(async () => {
    const result = await runCheck();
    if (result?.status === "available") {
      setPrompt({ versionName: result.versionName, percent: null });
    }
  }, [runCheck, setPrompt]);

  return { check, checkOnOpen, checkNow, available: AppUpdater !== null };
};
