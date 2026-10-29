import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { usePathname } from "expo-router";
import { useAtomValue } from "jotai";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AppState, Keyboard, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import {
  clearJellyseerrStorageData,
  useJellyseerr,
} from "@/hooks/useJellyseerr";
import { requestWeaselSeerrReconnect } from "@/hooks/useWeaselSeerrAutoConnect";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { requestSheetCountAtom } from "@/utils/atoms/requestStatus";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import { storage } from "@/utils/mmkv";
import {
  deriveRequestStage,
  type OwnRequest,
  type RequestStatusRow,
  reconcileRequestJournal,
  requestAccountMatches,
  requestScope,
  terminalStage,
} from "@/utils/requestStatus";
import { openMyRequests } from "@/utils/requestStatusNavigation";
import {
  claimRequestPresentation,
  forgetOwnRequest,
  readRequestJournal,
  requestNotificationsEnabled,
  setRequestNotificationsEnabled,
  updateRequestJournal,
} from "@/utils/requestStatusStorage";
import {
  type OwnRequestsSnapshot,
  syncOwnRequests,
} from "@/utils/syncOwnRequests";
import { WEASEL_SEERR_URL } from "@/utils/weaselSeerr";

interface RequestsContextValue {
  scope?: string;
  rows: RequestStatusRow[];
  loading: boolean;
  refreshing: boolean;
  error: boolean;
  complete: boolean;
  updatedAt?: number;
  notifications: boolean;
  refresh(): void;
  setVisible(delta: number): void;
  toggleNotifications(): void;
  cancel(row: RequestStatusRow): Promise<void>;
}
const RequestsContext = createContext<RequestsContextValue | null>(null);
export const useRequestStatus = () => {
  const value = useContext(RequestsContext);
  if (!value) throw new Error("Missing request status provider");
  return value;
};

export function RequestStatusProvider({ children }: PropsWithChildren) {
  const { jellyseerrApi: client, jellyseerrUser } = useJellyseerr();
  const mediaUser = useAtomValue(userAtom);
  const mediaApi = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [visible, setVisible] = useState(0);
  const [version, bump] = useState(0);
  const session = useMemo(
    () =>
      client &&
      jellyseerrUser &&
      mediaUser?.Id &&
      mediaApi &&
      settings?.jellyseerrServerUrl &&
      requestAccountMatches(jellyseerrUser.jellyfinUserId, mediaUser.Id)
        ? {
            client,
            userId: jellyseerrUser.id,
            scope: requestScope(
              settings.jellyseerrServerUrl,
              jellyseerrUser.id,
            ),
            key: [
              "request-status",
              settings.jellyseerrServerUrl,
              jellyseerrUser.id,
              mediaUser.Id,
            ] as const,
            rows: [] as RequestStatusRow[],
            missing: new Map<number, number>(),
            failures: 0,
          }
        : undefined,
    [
      client,
      jellyseerrUser,
      mediaUser?.Id,
      mediaApi,
      settings?.jellyseerrServerUrl,
    ],
  );
  const mismatchCleared = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !jellyseerrUser ||
      !mediaUser?.Id ||
      requestAccountMatches(jellyseerrUser.jellyfinUserId, mediaUser.Id)
    )
      return;
    const pair = `${jellyseerrUser.id}|${mediaUser.Id}`;
    if (mismatchCleared.current === pair) return;
    mismatchCleared.current = pair;
    clearJellyseerrStorageData();
    if (settings?.jellyseerrServerUrl === WEASEL_SEERR_URL)
      requestWeaselSeerrReconnect();
  }, [jellyseerrUser, mediaUser?.Id, settings?.jellyseerrServerUrl]);
  const current = useRef(session);
  current.current = session;
  const currentSession = () =>
    !!session && current.current === session && session.client.isCurrent();
  const enabled = !!session && foreground && !Platform.isTV;
  const query = useQuery<OwnRequestsSnapshot>({
    queryKey: session?.key ?? ["request-status", "disconnected"],
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: false,
    refetchInterval: () => {
      if (!enabled || !session) return false;
      if (session.failures)
        return [60_000, 120_000, 300_000, 600_000][
          Math.min(3, session.failures - 1)
        ];
      return visible > 0 ||
        session.rows.some((r) =>
          ["DOWNLOADING", "ADDING"].includes(r.stage.kind),
        )
        ? 60_000
        : session.rows.some((r) => !terminalStage(r.stage))
          ? 300_000
          : 1_800_000;
    },
    queryFn: async ({ signal }) => {
      if (!session) throw new Error("Requests unavailable");
      try {
        const next = await syncOwnRequests(
          {
            list: (skip, signal) =>
              session.client.axios
                .get("/api/v1/request", {
                  params: {
                    filter: "all",
                    sort: "added",
                    take: 50,
                    skip,
                    requestedBy: session.userId,
                  },
                  signal,
                })
                .then((r) => r.data),
            detail: (id, signal) =>
              session.client.axios
                .get(`/api/v1/request/${id}`, { signal })
                .then((r) => r.data),
          },
          session.userId,
          session.rows,
          readRequestJournal(session.scope).known,
          session.missing,
          signal,
        );
        if (!currentSession()) throw new Error("Request account changed");
        signal.throwIfAborted();
        for (const [id, count] of session.missing)
          if (count >= 2) forgetOwnRequest(session.scope, id);
        updateRequestJournal(session.scope, (j) =>
          reconcileRequestJournal(
            j,
            next.rows,
            requestNotificationsEnabled(session.scope),
          ),
        );
        session.rows = next.rows;
        session.failures = 0;
        bump((n) => n + 1);
        return next;
      } catch (error) {
        if (!currentSession() || signal.aborted) throw error;
        session.failures++;
        const status = isAxiosError(error) ? error.response?.status : undefined;
        // Only list failures reach this catch. Detail failures are isolated by syncOwnRequests.
        const probeKey = `request-status-probe:${session.scope}`;
        const last = storage.getNumber(probeKey);
        if (
          (status === 401 || status === 403) &&
          (last === undefined || Date.now() - last >= 15 * 60_000)
        ) {
          storage.set(probeKey, Date.now());
          try {
            // Resolve every status so the legacy auth interceptor cannot clear a newer session.
            const response = await session.client.axios.get("/api/v1/auth/me", {
              signal,
              validateStatus: () => true,
            });
            if (
              settings?.jellyseerrServerUrl === WEASEL_SEERR_URL &&
              currentSession() &&
              !signal.aborted &&
              [401, 403].includes(response.status)
            ) {
              clearJellyseerrStorageData();
              requestWeaselSeerrReconnect();
            }
          } catch {
            /* Transport errors retain the session and last good rows. */
          }
        }
        throw error;
      }
    },
  });
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!session) return;
    if (!foreground) void queryClient.cancelQueries({ queryKey: session.key });
  }, [session, foreground, queryClient]);
  useEffect(
    () => () => {
      if (session) void queryClient.cancelQueries({ queryKey: session.key });
    },
    [session, queryClient],
  );
  useEffect(
    () =>
      eventBus.on<{ scope: string; request: OwnRequest }>(
        "requestStatusSubmitted",
        (event) => {
          if (
            !session ||
            !event ||
            event.scope !== session.scope ||
            !currentSession()
          )
            return;
          const row = {
            request: event.request,
            stage: deriveRequestStage(event.request),
            fresh:
              event.request.type !== "tv" || !!event.request.media?.seasons,
          };
          session.rows = [
            row,
            ...session.rows.filter((r) => r.request.id !== event.request.id),
          ];
          queryClient.setQueryData(
            session.key,
            (old: OwnRequestsSnapshot | undefined) => ({
              ...old,
              complete: old?.complete ?? false,
              updatedAt: old?.updatedAt ?? 0,
              rows: session.rows,
            }),
          );
          void queryClient.invalidateQueries({ queryKey: session.key });
          bump((n) => n + 1);
        },
      ),
    [session, queryClient],
  );
  const notifications = session
    ? requestNotificationsEnabled(session.scope)
    : true;
  const rows = session ? (query.data?.rows ?? session.rows) : [];
  const value: RequestsContextValue = {
    scope: session?.scope,
    rows,
    loading: enabled && !query.data && !query.isError,
    refreshing: query.isFetching,
    error: query.isError,
    complete: query.data?.complete ?? false,
    updatedAt: query.data?.updatedAt,
    notifications,
    refresh: () => {
      if (enabled) void query.refetch();
    },
    setVisible: (delta) => {
      if (
        delta > 0 &&
        visible === 0 &&
        enabled &&
        Date.now() - query.dataUpdatedAt > 60_000
      )
        void query.refetch();
      setVisible((n) => Math.max(0, n + delta));
    },
    toggleNotifications: () => {
      if (session) {
        setRequestNotificationsEnabled(session.scope, !notifications);
        bump((n) => n + 1);
      }
    },
    cancel: async (row) => {
      if (
        !session ||
        row.request.status !== 1 ||
        row.request.requestedBy?.id !== session.userId
      )
        return;
      await session.client.axios.delete(`/api/v1/request/${row.request.id}`);
      forgetOwnRequest(session.scope, row.request.id);
      if (!currentSession()) return;
      session.rows = session.rows.filter(
        (r) => r.request.id !== row.request.id,
      );
      queryClient.setQueryData(
        session.key,
        (old: OwnRequestsSnapshot | undefined) =>
          old ? { ...old, rows: session.rows } : old,
      );
      void queryClient.invalidateQueries({ queryKey: session.key });
      bump((n) => n + 1);
    },
  };
  return (
    <RequestsContext.Provider value={value}>
      {children}
      <RequestUpdateBanner foreground={foreground} version={version} />
    </RequestsContext.Provider>
  );
}

function RequestUpdateBanner({
  foreground,
  version,
}: {
  foreground: boolean;
  version: number;
}) {
  const { scope, notifications } = useRequestStatus();
  const { t } = useTranslation();
  const pathname = usePathname();
  const { isActive } = useNativePlayer();
  const requestSheets = useAtomValue(requestSheetCountAtom);
  const { isVisible } = useGlobalModal();
  const insets = useSafeAreaInsets();
  const [typing, setTyping] = useState(Keyboard.isVisible());
  const [batch, setBatch] = useState<{ scope?: string; keys: string[] }>({
    keys: [],
  });
  const keys = batch.scope === scope ? batch.keys : [];
  const setKeys = (value: string[] | ((old: string[]) => string[])) =>
    setBatch((old) => ({
      scope,
      keys:
        typeof value === "function"
          ? value(old.scope === scope ? old.keys : [])
          : value,
    }));
  const safe =
    !!scope &&
    foreground &&
    notifications &&
    !Platform.isTV &&
    !isActive &&
    !isVisible &&
    requestSheets === 0 &&
    !typing &&
    !/player|playback|now-playing|login|request-modal/.test(pathname);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setTyping(true));
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setTyping(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    setKeys([]);
  }, [scope]);
  useEffect(() => {
    if (!safe || !scope) return;
    const pending = readRequestJournal(scope).pending;
    const claimed = pending.filter((key) =>
      claimRequestPresentation(scope, key),
    );
    if (claimed.length) setKeys((old) => [...new Set([...old, ...claimed])]);
  }, [scope, safe, version]);
  useEffect(() => {
    if (!safe || !keys.length) return;
    const timer = setTimeout(() => setKeys([]), 15_000);
    return () => clearTimeout(timer);
  }, [safe, keys]);
  if (!safe || !keys.length) return null;
  return (
    <View
      style={{
        position: "absolute",
        top: insets.top + 10,
        left: 12,
        right: 12,
        padding: 16,
        gap: 10,
        backgroundColor: NeonBoard.card,
        borderColor: sectionAccent("requests"),
        borderWidth: 1,
        zIndex: 1000,
      }}
      accessibilityLiveRegion='polite'
    >
      <Text>{t("request_status.updates", { count: keys.length })}</Text>
      <View style={{ flexDirection: "row", gap: 24 }}>
        <Pressable
          accessibilityRole='button'
          style={{ minHeight: 44, justifyContent: "center" }}
          onPress={() => {
            const id =
              keys.length === 1 ? Number(keys[0]!.split("|")[1]) : undefined;
            setKeys([]);
            openMyRequests(id);
          }}
        >
          <Text>{t("request_status.view")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole='button'
          style={{ minHeight: 44, justifyContent: "center" }}
          onPress={() => setKeys([])}
        >
          <Text>{t("request_status.dismiss")}</Text>
        </Pressable>
      </View>
    </View>
  );
}
