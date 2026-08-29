import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { jellyseerrUserAtom } from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { provisionPinnedSeerr, WEASEL_SEERR_URL } from "@/utils/weaselSeerr";

/**
 * WeaselPlex: customers sign in to the media server once with Quick Connect
 * and never see a password again — so the request service must come along for
 * free, the way it does on the Android TV app. This runs after sign-in and
 * silently connects the pinned Seerr server using the Jellyfin session the
 * device already holds.
 *
 * Failures are logged and retried on the next sign-in, never surfaced:
 * a customer must still be able to watch when the request service is down.
 * A manually configured different Seerr server is left alone.
 */
export const useWeaselSeerrAutoConnect = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const jellyseerrUser = useAtomValue(jellyseerrUserAtom);
  const setJellyseerrUser = useSetAtom(jellyseerrUserAtom);
  const { settings, updateSettings } = useSettings();

  // One attempt per Jellyfin user per app session: enough to self-heal on the
  // next launch or account switch, without hammering a server that is down.
  const attemptedForUser = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!api?.accessToken || !user?.Id) return;
    if (jellyseerrUser) return;
    if (
      settings?.jellyseerrServerUrl &&
      settings.jellyseerrServerUrl !== WEASEL_SEERR_URL
    ) {
      return;
    }
    if (attemptedForUser.current === user.Id) return;
    attemptedForUser.current = user.Id;

    (async () => {
      try {
        const seerrUser = await provisionPinnedSeerr(api);
        updateSettings({ jellyseerrServerUrl: WEASEL_SEERR_URL });
        setJellyseerrUser(seerrUser);
        writeInfoLog("Connected to the pinned Seerr server silently");
      } catch (e) {
        writeErrorLog("Silent Seerr connect failed", `${e}`);
      }
    })();
  }, [
    api,
    user?.Id,
    jellyseerrUser,
    settings?.jellyseerrServerUrl,
    updateSettings,
    setJellyseerrUser,
  ]);
};
