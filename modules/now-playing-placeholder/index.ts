import { Platform, requireNativeModule } from "expo-modules-core";

/**
 * iOS only. The AirPlay route picker shows the Now Playing artwork in its
 * head; while nothing plays that slot is an empty square. The cast sheet
 * fills it with the app icon for as long as it is open.
 */
const NowPlayingPlaceholder = (() => {
  if (Platform.OS !== "ios") return null;
  try {
    return requireNativeModule("NowPlayingPlaceholder");
  } catch {
    return null;
  }
})();

/** Seed the Now Playing center with the app icon if nothing is playing. */
export async function showNowPlayingPlaceholder(): Promise<boolean> {
  if (!NowPlayingPlaceholder) return false;
  try {
    return Boolean(await NowPlayingPlaceholder.show());
  } catch {
    return false;
  }
}

/** Remove the placeholder again (a no-op if real playback replaced it). */
export async function hideNowPlayingPlaceholder(): Promise<void> {
  if (!NowPlayingPlaceholder) return;
  try {
    await NowPlayingPlaceholder.hide();
  } catch {
    // Nothing to clean up.
  }
}
