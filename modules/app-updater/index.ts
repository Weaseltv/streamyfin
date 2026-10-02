import {
  type EventSubscription,
  Platform,
  requireNativeModule,
} from "expo-modules-core";

export type UpdateCheckResult =
  | {
      /** `ahead`: this build is newer than the published one (a test build). */
      status: "available" | "upToDate" | "ahead";
      versionName: string;
      versionCode: number;
      apkSizeBytes: number;
    }
  | { status: "notPublished" }
  /** Not the signed WeaselPlex release (e.g. a development build). */
  | { status: "unsupported"; reason: "package" | "signer" };

export interface DownloadProgressEvent {
  downloadedBytes: number;
  totalBytes: number;
}

/** Error codes the native module rejects with. */
export type AppUpdaterErrorCode =
  | "ERR_UPDATE_CANCELLED"
  | "ERR_UPDATE_NETWORK"
  | "ERR_UPDATE_SECURITY"
  | "ERR_UPDATE_STALE";

interface AppUpdaterNativeModule {
  /** Fetches and verifies the signed stable channel on theweasel.tv. */
  checkForUpdate(): Promise<UpdateCheckResult>;
  /** Downloads and verifies the release found by the last check. */
  downloadUpdate(): Promise<void>;
  cancelDownload(): void;
  /** Whether "Install unknown apps" is allowed for WeaselPlex. */
  canInstallPackages(): boolean;
  openInstallPermissionSettings(): void;
  /** Opens Android's installer for the downloaded APK. */
  installUpdate(): Promise<"installer" | "needsPermission">;
  addListener(
    eventName: "onDownloadProgress",
    listener: (event: DownloadProgressEvent) => void,
  ): EventSubscription;
}

// Android only: iOS updates through TestFlight, and WeaselPlex TV is the separate
// Wholphin app with its own updater. Null when the module isn't linked.
const AppUpdater: AppUpdaterNativeModule | null = (() => {
  if (Platform.OS !== "android") return null;
  try {
    return requireNativeModule<AppUpdaterNativeModule>("AppUpdater");
  } catch {
    return null;
  }
})();

export default AppUpdater;

export const errorCode = (error: unknown): string | undefined =>
  (error as { code?: string } | null)?.code;
