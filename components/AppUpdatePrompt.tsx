import * as Application from "expo-application";
import { useAtom, useAtomValue } from "jotai";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform } from "react-native";
import { toast } from "sonner-native";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import AppUpdater, { errorCode } from "@/modules/app-updater";
import { pendingAccountSaveAtom, userAtom } from "@/providers/JellyfinProvider";
import { downloadPercent, UPDATE_PROMPT_SHOWN_AT_KEY } from "@/utils/appUpdate";
import { appUpdatePromptAtom, playerOpenAtom } from "@/utils/atoms/appUpdate";
import { writeErrorLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";

/**
 * "WeaselPlex 1.8 is available." with Update and Not now (Android phone only).
 *
 * Checks when the app opens or comes back to the foreground once signed in, at most once
 * every 12 hours (Settings > Check for updates works any time). Update downloads and
 * verifies the release, then opens Android's installer. The popup waits while the player
 * or the save-account prompt is showing.
 */
export const AppUpdatePrompt: React.FC = () => {
  const { t } = useTranslation();
  const signedIn = !!useAtomValue(userAtom);
  const pendingAccountSave = useAtomValue(pendingAccountSaveAtom);
  const playerOpen = useAtomValue(playerOpenAtom);
  const [prompt, setPrompt] = useAtom(appUpdatePromptAtom);
  const { checkOnOpen } = useAppUpdate();
  const awaitingPermission = useRef(false);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const downloading = prompt?.percent != null;

  /** Sends the user to allow "Install unknown apps"; the popup resumes on return. */
  const requestInstallPermission = useCallback(() => {
    if (AppUpdater?.openInstallPermissionSettings()) {
      awaitingPermission.current = true;
      // Android can restart the app when the permission is granted; clearing the
      // timestamp brings the popup back if that happens.
      storage.remove(UPDATE_PROMPT_SHOWN_AT_KEY);
    } else {
      toast.error(t("app_update.allow_installs"));
    }
  }, [t]);

  const download = useCallback(async () => {
    if (!AppUpdater) return;
    try {
      await AppUpdater.downloadUpdate();
    } catch (error) {
      // The native module forgets the checked release if Android restarted the app.
      if (errorCode(error) !== "ERR_UPDATE_STALE") throw error;
      const result = await AppUpdater.checkForUpdate();
      if (result.status !== "available") throw error;
      await AppUpdater.downloadUpdate();
    }
  }, []);

  const startUpdate = useCallback(async () => {
    const current = promptRef.current;
    if (!AppUpdater || !current || current.percent != null) return;
    // Ask before downloading: Android can restart the app when the permission is
    // granted, which would kill a download in progress.
    if (!AppUpdater.canInstallPackages()) {
      requestInstallPermission();
      return;
    }
    storage.set(UPDATE_PROMPT_SHOWN_AT_KEY, Date.now());
    setPrompt({ versionName: current.versionName, percent: 0 });
    const subscription = AppUpdater.addListener(
      "onDownloadProgress",
      ({ downloadedBytes, totalBytes }) =>
        setPrompt((p) =>
          p
            ? { ...p, percent: downloadPercent(downloadedBytes, totalBytes) }
            : p,
        ),
    );
    try {
      await download();
      if ((await AppUpdater.installUpdate()) === "needsPermission") {
        requestInstallPermission();
      }
      setPrompt(null);
    } catch (error) {
      const code = errorCode(error);
      if (code !== "ERR_UPDATE_CANCELLED") {
        writeErrorLog(
          `App update failed (${code}): ${(error as Error)?.message}`,
        );
        toast.error(
          t(
            code === "ERR_UPDATE_SECURITY"
              ? "app_update.unverified"
              : "app_update.failed",
          ),
        );
      }
      setPrompt(null);
    } finally {
      subscription.remove();
    }
  }, [download, requestInstallPermission, setPrompt, t]);

  const startUpdateRef = useRef(startUpdate);
  startUpdateRef.current = startUpdate;

  useEffect(() => {
    if (!AppUpdater || Platform.isTV || !signedIn) return;
    if (!promptRef.current) checkOnOpen();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (awaitingPermission.current) {
        // Back from "Install unknown apps" without Android restarting the app.
        awaitingPermission.current = false;
        if (AppUpdater?.canInstallPackages()) startUpdateRef.current();
        return;
      }
      if (!promptRef.current) checkOnOpen();
    });
    return () => subscription.remove();
  }, [signedIn, checkOnOpen]);

  if (!prompt) return null;

  return (
    <ConfirmDialog
      visible={signedIn && !playerOpen && !pendingAccountSave}
      title={t("app_update.title", {
        app: Application.applicationName ?? "WeaselPlex",
        version: prompt.versionName,
      })}
      message={
        downloading
          ? t("app_update.downloading", { percent: prompt.percent })
          : null
      }
      confirmLabel={t("app_update.update")}
      cancelLabel={downloading ? t("common.cancel") : t("app_update.not_now")}
      loading={downloading}
      cancellableWhileLoading
      onConfirm={startUpdate}
      onCancel={() => {
        if (downloading) {
          AppUpdater?.cancelDownload();
        } else {
          setPrompt(null);
        }
      }}
    />
  );
};
