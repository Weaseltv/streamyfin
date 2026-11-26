// Registers the tsx require hook so the TypeScript config plugins referenced
// from app.json ("./plugins/*.ts") can be loaded by Node during config evaluation.
import "tsx/cjs";
import { execFileSync } from "node:child_process";
import type { ConfigContext, ExpoConfig } from "expo/config";

// Build metadata, injected into `extra.build` and read at runtime via
// expo-constants (see utils/version.ts). Sources in priority order:
// EAS cloud build → GitHub Actions → explicit EXPO_PUBLIC_* → local git → null.
const git = (args: string[]): string | null => {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

const buildMeta = {
  commit:
    (
      process.env.EAS_BUILD_GIT_COMMIT_HASH ||
      process.env.GITHUB_SHA ||
      process.env.EXPO_PUBLIC_GIT_COMMIT ||
      git(["rev-parse", "HEAD"]) ||
      ""
    ).slice(0, 7) || null,
  branch:
    process.env.EAS_BUILD_GIT_BRANCH ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_NAME ||
    process.env.EXPO_PUBLIC_GIT_BRANCH ||
    git(["rev-parse", "--abbrev-ref", "HEAD"]) ||
    null,
  profile:
    process.env.EAS_BUILD_PROFILE ||
    process.env.EXPO_PUBLIC_BUILD_PROFILE ||
    null,
  // GitHub Actions run number (#2098) — lets anyone map a sideloaded CI build back
  // to its Actions run (artifacts + logs) without Expo access. Null outside CI.
  runNumber:
    process.env.GITHUB_RUN_NUMBER ||
    process.env.EXPO_PUBLIC_GIT_RUN_NUMBER ||
    null,
  builtAt: new Date().toISOString(),
};

export default ({ config }: ConfigContext): ExpoConfig => {
  if (process.env.EXPO_TV !== "1") {
    config.plugins?.push("expo-background-task");
    config.plugins?.push([
      "expo-local-authentication",
      {
        faceIDPermission:
          "Allow WeaselPlex to use Face ID to unlock your profile.",
      },
    ]);

    config.plugins?.push([
      "expo-camera",
      {
        cameraPermission:
          "Allow WeaselPlex to access the camera to scan QR codes for TV login.",
      },
    ]);
  }

  // Firebase (request notifications, plan 5.10): the committed google-services.json is the
  // WeaselPlex project's app for tv.theweasel.weaselplex.phone, so every Android phone build path
  // (the PR compile check, Build Apps, emulator and release builds) gets it; GOOGLE_SERVICES_JSON
  // can point elsewhere. Android TV and tvOS builds (EXPO_TV=1) never get it; phone prebuilds run
  // with EXPO_TV=0 or unset.
  const androidConfig: { googleServicesFile?: string } = {};
  if (process.env.EXPO_TV !== "1") {
    androidConfig.googleServicesFile =
      process.env.GOOGLE_SERVICES_JSON || "./google-services.json";
  }

  config.extra = { ...config.extra, build: buildMeta };

  return {
    ...config,
    android: { ...config.android, ...androidConfig },
  } as ExpoConfig;
};
