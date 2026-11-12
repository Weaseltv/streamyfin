import type { SessionInfoDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { Platform } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const _Notifications = !Platform.isTV ? require("expo-notifications") : null;

export interface useSessionsProps {
  refetchInterval: number;
  activeWithinSeconds: number;
}

/**
 * Sessions that are playing something, for the Sessions screen.
 *
 * Admins see every active session. Everyone else sees the sessions the server
 * lets them control (their own account's other devices, or more if an admin
 * granted "allow remote control of other users"), so a regular user can pause
 * or stop their TV from their phone.
 */
export const useSessions = ({
  refetchInterval = 5 * 1000,
  activeWithinSeconds = 360,
}: useSessionsProps) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data, isLoading } = useQuery({
    queryKey: ["sessions", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id) {
        return [];
      }
      const response = await getSessionApi(api).getSessions(
        user.Policy?.IsAdministrator
          ? { activeWithinSeconds }
          : { activeWithinSeconds, controllableByUserId: user.Id },
      );

      const result = response.data
        .filter((s) => s.NowPlayingItem)
        .sort((a, b) =>
          (b.NowPlayingItem?.Name ?? "").localeCompare(
            a.NowPlayingItem?.Name ?? "",
          ),
        );

      // Notifications.setBadgeCountAsync(result.length);
      return result;
    },
    refetchInterval: refetchInterval,
  });

  return { sessions: data, isLoading };
};

export interface useRemoteSessionsProps extends Partial<useSessionsProps> {
  /** Poll only while true, eg while the chooser is open. */
  enabled?: boolean;
}

/**
 * Devices the current user can "Play On".
 *
 * The server only lists sessions that advertise media control, currently have
 * a web socket open, and that this user is allowed to control. This device is
 * excluded, as are clients that cannot be driven remotely.
 */
export const useAllSessions = ({
  refetchInterval = 5 * 1000,
  activeWithinSeconds = 360,
  enabled = true,
}: useRemoteSessionsProps = {}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data, isLoading } = useQuery({
    queryKey: ["remoteSessions", user?.Id],
    queryFn: async (): Promise<SessionInfoDto[]> => {
      if (!api || !user?.Id) {
        return [];
      }
      const response = await getSessionApi(api).getSessions({
        activeWithinSeconds,
        controllableByUserId: user.Id,
      });
      const ownDeviceId = api.deviceInfo?.id;
      return response.data
        .filter((s) => s.SupportsRemoteControl && s.DeviceId !== ownDeviceId)
        .sort((a, b) => (a.DeviceName ?? "").localeCompare(b.DeviceName ?? ""));
    },
    enabled: enabled && !!api && !!user?.Id,
    refetchInterval: enabled ? refetchInterval : false,
  });

  return { sessions: data, isLoading };
};
