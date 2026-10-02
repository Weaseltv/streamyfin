import { atom } from "jotai";

/** The Settings row's view of the last update check (Android phone only). */
export type AppUpdateCheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; versionName: string }
  | { kind: "upToDate" }
  /** A development build, which can't install a signed release over itself. */
  | { kind: "unsupported" }
  | { kind: "error" };

/** The update popup, or null when hidden. */
export interface AppUpdatePromptState {
  versionName: string;
  /** Download progress 0–100, or null before the download starts. */
  percent: number | null;
}

export const appUpdateCheckAtom = atom<AppUpdateCheckState>({ kind: "idle" });

export const appUpdatePromptAtom = atom<AppUpdatePromptState | null>(null);

/** True while the video player is open, so the update popup never covers playback. */
export const playerOpenAtom = atom(false);
