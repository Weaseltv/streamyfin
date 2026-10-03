import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import AppUpdater, { type UpdateCheckResult } from "@/modules/app-updater";
import {
  isUpdatePromptDue,
  UPDATE_PROMPT_SHOWN_AT_KEY,
  UPDATE_PROMPT_VERSION_KEY,
} from "@/utils/appUpdate";
import {
  appUpdateCheckAtom,
  appUpdatePromptAtom,
} from "@/utils/atoms/appUpdate";
import { writeErrorLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";

const promptFor = (result: {
  versionName: string;
  releaseNotes: string[];
}) => ({
  versionName: result.versionName,
  releaseNotes: result.releaseNotes,
});

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
        setCheck({
          kind: "available",
          versionName: result.versionName,
          releaseNotes: result.releaseNotes,
        });
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

  /**
   * On open: offer a newer release straight away, and the same release again at most
   * once every 12 hours.
   */
  const checkOnOpen = useCallback(async () => {
    if (!AppUpdater) return;
    const result = await runCheck();
    if (result?.status !== "available") return;
    const last = {
      shownAt: storage.getNumber(UPDATE_PROMPT_SHOWN_AT_KEY),
      versionCode: storage.getNumber(UPDATE_PROMPT_VERSION_KEY),
    };
    if (!isUpdatePromptDue(last, result.versionCode, Date.now())) return;
    storage.set(UPDATE_PROMPT_SHOWN_AT_KEY, Date.now());
    storage.set(UPDATE_PROMPT_VERSION_KEY, result.versionCode);
    setPrompt({ ...promptFor(result), percent: null });
  }, [runCheck, setPrompt]);

  /** From Settings: check now, and offer the update straight away if there is one. */
  const checkNow = useCallback(async () => {
    const result = await runCheck();
    if (result?.status === "available") {
      setPrompt({ ...promptFor(result), percent: null });
    }
  }, [runCheck, setPrompt]);

  return { check, checkOnOpen, checkNow, available: AppUpdater !== null };
};
