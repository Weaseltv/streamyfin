import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/** Demuxer read-ahead and back-buffer caps, in MB. */
export interface MpvBufferBudget {
  maxBytes: number;
  maxBackBytes: number;
}

/**
 * The budget every phone used to get, whatever its memory. Kept so that stored
 * settings still holding this exact pair can be recognised as never customised.
 */
export const LEGACY_PHONE_BUDGET: MpvBufferBudget = {
  maxBytes: 150,
  maxBackBytes: 50,
};

/** Android TV's tier, unchanged. */
const ANDROID_TV_BUDGET: MpvBufferBudget = { maxBytes: 75, maxBackBytes: 30 };

type DeviceMemory = { totalMb: number; lowRam: boolean };

const readDeviceMemory = (): DeviceMemory | undefined => {
  const mpv = requireOptionalNativeModule<{
    getDeviceMemory?: () => DeviceMemory;
  }>("MpvPlayer");
  if (typeof mpv?.getDeviceMemory !== "function") return undefined;
  try {
    return mpv.getDeviceMemory();
  } catch {
    return undefined;
  }
};

/**
 * Android phone budget by memory (R22). The Android TV tier exists because the
 * phone budget pushed 2 GB TV boxes into swap death during 4K HDR playback;
 * a 2–3 GB phone is the same class of device and got the full phone budget.
 *
 * These are caps, not allocations: mpv only fills them when the stream's
 * bitrate times cache-secs exceeds them (4K remux, long back-buffer), which
 * is exactly when a small phone runs out.
 */
export const androidPhoneBudget = (
  memory: DeviceMemory | undefined,
): MpvBufferBudget => {
  if (!memory) return LEGACY_PHONE_BUDGET;
  if (memory.lowRam || memory.totalMb <= 2560) {
    return { maxBytes: 50, maxBackBytes: 20 };
  }
  if (memory.totalMb <= 3584) return ANDROID_TV_BUDGET;
  if (memory.totalMb <= 4608) return { maxBytes: 100, maxBackBytes: 40 };
  return LEGACY_PHONE_BUDGET;
};

let cached: MpvBufferBudget | undefined;

/** The default demuxer budget for this device. */
export const defaultMpvBufferBudget = (): MpvBufferBudget => {
  if (Platform.OS !== "android") return LEGACY_PHONE_BUDGET;
  if (Platform.isTV) return ANDROID_TV_BUDGET;
  if (cached) return cached;
  const memory = readDeviceMemory();
  const budget = androidPhoneBudget(memory);
  // Only cache a real answer, so an early call cannot pin the fallback.
  if (memory) cached = budget;
  return budget;
};
