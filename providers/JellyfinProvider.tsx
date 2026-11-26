import "@/augmentations";
import { type Api, Jellyfin } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { router as appRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { atom, useAtom } from "jotai";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform } from "react-native";
import { getDeviceNameSync } from "react-native-device-info";
import { toast } from "sonner-native";
import { JELLYFIN_CLIENT_NAME } from "@/constants/Client";
import useRouter from "@/hooks/useAppRouter";
import { useInterval } from "@/hooks/useInterval";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import {
  confirmRequestPolicy,
  registerPolicyRefresh,
  requestPolicyAtom,
} from "@/utils/atoms/requestPolicy";
import { useSettingsActions } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { getOrSetDeviceId } from "@/utils/device";
import { createApiWithCustomHeaders } from "@/utils/jellyfin/createApi";
import { subtitleModeFromProfile } from "@/utils/jellyfin/userConfiguration";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { isAdultOnlyRoute } from "@/utils/profiles/navigation";
import {
  forgetProfileBiometric,
  grantIsCurrent,
  isKidProtected,
  isPhoneKid,
  type KidSignIn,
  lockProfile,
  type PhoneProfile,
  type PreparedProfile,
  phoneProfilesEnabled,
  preparePhoneProfile,
  profilesFor,
  recordCeiling,
  requiresParent,
  savePhoneProfile,
} from "@/utils/profiles/phoneProfiles";
import { seerrExchanges } from "@/utils/requestStatus/exchangeQueue";
import {
  resetPushState,
  unregisterBeforeSignOut,
} from "@/utils/requestStatus/native/push";
import { passwordSignIn } from "@/utils/requestStatus/native/signIn";
import { policySessionKey } from "@/utils/requestStatus/policy";
import { isConfirmedAdult } from "@/utils/requestStatus/visibility";
import {
  type AccountSecurityType,
  addAccountToServer,
  addServerToList,
  deleteAccountCredential,
  getAccountCredential,
  hashPIN,
  migrateToMultiAccount,
  saveAccountCredential,
  updateAccountToken,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";
import { clearTVDiscoverySafely } from "@/utils/tvDiscovery/sync";
import { APP_VERSION } from "@/utils/version";
import { clearWeaselSeerrRefusal } from "@/utils/weaselSeerrRefusal";

interface Server {
  address: string;
}

/** Server URLs compare equal regardless of trailing slashes. */
const sameServerUrl = (a: string | null | undefined, b: string) =>
  (a ?? "").replace(/\/+$/, "") === b.replace(/\/+$/, "");

const initialApi = (() => {
  if (phoneProfilesEnabled) return null;
  try {
    const token = storage.getString("token") || null;
    const serverUrl = storage.getString("serverUrl") || null;
    if (serverUrl && token) {
      const id = getOrSetDeviceId();
      const deviceName = getDeviceNameSync();
      const jellyfinInstance = new Jellyfin({
        clientInfo: { name: JELLYFIN_CLIENT_NAME, version: APP_VERSION },
        deviceInfo: {
          name: deviceName,
          id,
        },
      });
      return createApiWithCustomHeaders(jellyfinInstance, serverUrl, token);
    }
  } catch (e) {
    console.error("Failed to initialize API synchronously:", e);
  }
  return null;
})();

const initialUser = (() => {
  if (phoneProfilesEnabled) return null;
  try {
    // Only return a stored user if we also have a token. Otherwise the
    // user atom would be populated while the api atom is null (e.g. after
    // a logout that left stale user JSON in storage), which causes
    // useProtectedRoute to keep us inside the (auth) group instead of
    // redirecting to /login.
    const token = storage.getString("token");
    if (!token) return null;
    const userStr = storage.getString("user");
    if (userStr) {
      return JSON.parse(userStr) as UserDto;
    }
  } catch (e) {
    console.error("Failed to parse initial user synchronously:", e);
  }
  return null;
})();

export const apiAtom = atom<Api | null>(initialApi);
export const userAtom = atom<UserDto | null>(initialUser);
export const wsAtom = atom<WebSocket | null>(null);
export const pendingPhoneProfileAtom = atom<PreparedProfile | null>(null);
export const cacheVersionAtom = atom<number>(0);
// Set by a login flow that wants the account saved: the protection picker
// shows AFTER the session is authorized (the login screen unmounts on
// success, so the modal lives at the root — see PendingAccountSaveModal).
export const pendingAccountSaveAtom = atom<{ serverName?: string } | null>(
  null,
);

interface LoginOptions {
  saveAccount?: boolean;
  securityType?: AccountSecurityType;
  pinCode?: string;
}

interface JellyfinContextValue {
  discoverServers: (url: string) => Promise<Server[]>;
  setServer: (server: Server) => Promise<void>;
  removeServer: () => void;
  login: (
    username: string,
    password: string,
    serverName?: string,
    options?: LoginOptions,
  ) => Promise<void>;
  saveCurrentAccount: (options?: {
    securityType?: AccountSecurityType;
    pinCode?: string;
    serverName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  initiateQuickConnect: () => Promise<string | undefined>;
  stopQuickConnectPolling: () => void;
  loginWithSavedCredential: (
    serverUrl: string,
    userId: string,
  ) => Promise<void>;
  loginWithPassword: (
    serverUrl: string,
    username: string,
    password: string,
  ) => Promise<void>;
  removeSavedCredential: (serverUrl: string, userId: string) => Promise<void>;
  switchServerUrl: (newUrl: string) => void;
  openProfileChooser: () => void;
  prepareSavedProfile: (profile: PhoneProfile) => Promise<PreparedProfile>;
  enterPhoneProfile: (
    profile: PreparedProfile,
    isCurrent: () => boolean,
    parent?: PreparedProfile,
  ) => Promise<void>;
  addPhoneKid: (
    parent: PreparedProfile,
    kid: KidSignIn,
    isCurrent: () => boolean,
  ) => Promise<void>;
  cancelPendingProfile: () => void;
}

const JellyfinContext = createContext<JellyfinContextValue | undefined>(
  undefined,
);

export const JellyfinProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [jellyfin] = useState<Jellyfin | undefined>(() => {
    try {
      const id = getOrSetDeviceId();
      const deviceName = getDeviceNameSync();
      return new Jellyfin({
        clientInfo: { name: JELLYFIN_CLIENT_NAME, version: APP_VERSION },
        deviceInfo: {
          name: deviceName,
          id,
        },
      });
    } catch (e) {
      console.error("Failed to initialize Jellyfin synchronously in state:", e);
      return undefined;
    }
  });
  const [deviceId] = useState<string | undefined>(() => {
    try {
      return getOrSetDeviceId();
    } catch {
      return undefined;
    }
  });

  const { t } = useTranslation();

  const [api, setApi] = useAtom(apiAtom);
  const [user, setUser] = useAtom(userAtom);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [secret, setSecret] = useState<string | null>(null);
  const { updateSettings, setPluginSettings, refreshStreamyfinPluginSettings } =
    useSettingsActions();
  const { clearAllJellyseerData, setJellyseerrUser } = useJellyseerr();
  const queryClient = useQueryClient();

  // Apply the phone account's subtitle mode at login/session restoration, not
  // only after visiting Audio & subtitles. This replaces an older cached Smart
  // factory default for untouched profiles and restores explicit account modes
  // on a fresh installation or account switch. Never write the profile here.
  useEffect(() => {
    if (Platform.isTV) return;
    const subtitleMode = subtitleModeFromProfile(
      user?.Configuration?.SubtitleMode,
      false,
    );
    if (subtitleMode !== undefined) updateSettings({ subtitleMode });
  }, [user, updateSettings]);

  // --- Session-expiry handling ----------------------------------------------
  // When the server revokes the token (e.g. the device/session is deleted), a
  // 401 can surface from any authenticated request. Without central handling
  // the dead token stays in storage, so every reload re-fires authed calls →
  // 401 spam + uncaught rejections, and the app lingers in a half-authenticated
  // state. A single response interceptor on the authenticated api clears the
  // session on the first 401 so the app drops cleanly to the login screen.
  const sessionExpiredRef = useRef(false);
  const sessionGeneration = useRef(0);
  const quickConnectSecret = useRef<string | null>(null);
  const exchangingSecret = useRef<string | null>(null);

  // Shared teardown for manual logout AND forced session expiry — keeping it
  // in one place prevents the two paths from drifting (a 401 expiry must wipe
  // plugin settings / Jellyseerr state too, or the next login on the same
  // device inherits the previous user's data).
  // Saved credentials are kept so the user can quick-login again.
  const clearSessionState = useCallback(async () => {
    // All synchronous teardown first: if the async Jellyseerr cleanup below
    // fails or resolves late (user may already be re-authenticating), the
    // session/cache state is already gone.
    sessionGeneration.current++;
    storage.remove("token");
    storage.remove("user");
    storage.remove("REACT_QUERY_OFFLINE_CACHE");
    clearTVDiscoverySafely();
    setUser(null);
    setApi(null);
    // Request access ends with the session; a running request sign-in is
    // abandoned so its answer is never saved for the next person.
    store.set(requestPolicyAtom, null);
    seerrExchanges.cancel();
    // A forced expiry sends no DELETE (the website couldn't verify the token).
    resetPushState();
    setPluginSettings(undefined);
    queryClient.clear();

    try {
      await clearAllJellyseerData();
    } catch (e) {
      writeErrorLog(
        `Failed to clear Jellyseerr data: ${e instanceof Error ? e.message : e}`,
      );
    }
  }, [setUser, setApi, setPluginSettings, clearAllJellyseerData, queryClient]);

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return; // run once per session
    sessionExpiredRef.current = true;
    clearSessionState().catch((e) =>
      writeErrorLog(`Session-expiry cleanup failed: ${e?.message ?? e}`),
    );
  }, [clearSessionState]);

  useEffect(() => {
    // Only guard an authenticated session. A pre-auth api (login screen) keeps
    // its own handling — a wrong-password 401 is not a session expiry.
    if (!api?.accessToken) return;
    sessionExpiredRef.current = false; // re-arm for this fresh session
    const interceptorId = api.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401 && store.get(apiAtom) === api) {
          handleSessionExpired();
        }
        return Promise.reject(error);
      },
    );
    return () => {
      api.axiosInstance.interceptors.response.eject(interceptorId);
    };
  }, [api, handleSessionExpired]);

  const publishPhoneProfile = useCallback(
    (profile: PreparedProfile, keepCache: boolean) => {
      if (!jellyfin || !profile.api.accessToken)
        throw new Error("Sign this profile in again.");
      const { accessToken } = profile.api;
      const ceiling = profile.account.ceiling ?? null;
      recordCeiling(ceiling);
      const nextApi = createApiWithCustomHeaders(
        jellyfin,
        profile.account.serverUrl,
        accessToken,
        undefined,
        ceiling ?? undefined,
      );
      const nextUser = { ...profile.user, Name: profile.account.username };
      if (!keepCache) {
        queryClient.clear();
        storage.remove("REACT_QUERY_OFFLINE_CACHE");
      }
      storage.set("serverUrl", profile.account.serverUrl);
      storage.set("token", accessToken);
      storage.set("user", JSON.stringify(nextUser));
      confirmRequestPolicy(nextApi.basePath, accessToken, nextUser);
      setApi(nextApi);
      setUser(nextUser);
      store.set(pendingPhoneProfileAtom, null);
      void refreshStreamyfinPluginSettings();
    },
    [jellyfin, queryClient, setApi, setUser, refreshStreamyfinPluginSettings],
  );

  const prepareSavedProfile = useCallback(
    async (account: PhoneProfile) => {
      if (!jellyfin) throw new Error("Could not reach WeaselPlex.");
      const credential = await getAccountCredential(
        account.serverUrl,
        account.userId,
      );
      if (!credential) throw new Error("Sign this profile in again.");
      const profileApi = createApiWithCustomHeaders(
        jellyfin,
        account.serverUrl,
        credential.token,
      );
      try {
        return await preparePhoneProfile(profileApi, account);
      } catch (error) {
        if (
          account.ceiling != null &&
          axios.isAxiosError(error) &&
          error.response?.status === 401
        ) {
          await deleteAccountCredential(account.serverUrl, account.userId);
        }
        throw error;
      }
    },
    [jellyfin],
  );

  const enterPhoneProfile = useCallback(
    async (
      profile: PreparedProfile,
      isCurrent: () => boolean,
      parent?: PreparedProfile,
      keepCache = false,
    ) => {
      const generation = sessionGeneration.current;
      const check = () => {
        if (!isCurrent() || generation !== sessionGeneration.current) {
          throw new Error("Choose a profile again.");
        }
        const ceiling = profile.account.ceiling;
        if (ceiling === undefined)
          throw new Error("Sign this profile in again.");
        if (ceiling === null) {
          if (
            (profile.pinLength || isKidProtected()) &&
            !grantIsCurrent(profile)
          ) {
            throw new Error("Enter the grown-up PIN first.");
          }
        } else if (requiresParent(ceiling) && !grantIsCurrent(parent)) {
          throw new Error("A grown-up needs to unlock this profile.");
        }
      };
      check();
      const initial = profile.account.ceiling;
      if (initial !== null) {
        const { data: latest } = await getUserApi(profile.api).getCurrentUser({
          timeout: 5_000,
        });
        const ceiling = latest.Policy?.MaxParentalRating;
        if (
          latest.Id !== profile.user.Id ||
          ceiling == null ||
          latest.Policy?.IsDisabled
        ) {
          throw new Error("Sign this profile in again.");
        }
        profile.user = { ...latest, Id: profile.user.Id };
        profile.account.ceiling = ceiling;
      }
      check();
      await savePhoneProfile(profile);
      check();
      lockProfile(profile);
      if (parent) lockProfile(parent);
      publishPhoneProfile(profile, keepCache);
    },
    [publishPhoneProfile],
  );

  const openProfileChooser = useCallback(() => {
    void clearSessionState();
    if (appRouter.canDismiss()) appRouter.dismissAll();
    appRouter.replace("/login");
  }, [clearSessionState]);

  const admitPhoneSignIn = useCallback(
    async (
      serverUrl: string,
      accessToken: string,
      user: UserDto,
      isCurrent: () => boolean = () => true,
    ) => {
      if (!jellyfin || !user.Id) throw new Error("Sign this profile in again.");
      const profileApi = createApiWithCustomHeaders(
        jellyfin,
        serverUrl,
        accessToken,
      );
      const saved = profilesFor(serverUrl).find(
        (profile) => profile.userId === user.Id,
      );
      const profile = await preparePhoneProfile(
        profileApi,
        {
          ...saved,
          serverUrl,
          userId: user.Id,
          username:
            saved?.ceiling != null ? saved.username : (user.Name ?? "Profile"),
          securityType: "none",
          savedAt: saved?.savedAt ?? Date.now(),
        },
        true,
      );
      if (!isCurrent()) return;
      if (
        profile.pinLength ||
        (profile.account.ceiling === null && !profile.user.PrimaryImageTag) ||
        (profile.account.ceiling === null && isKidProtected()) ||
        (profile.account.ceiling != null &&
          (requiresParent(profile.account.ceiling) ||
            profilesFor().some(
              (account) =>
                account.userId !== profile.user.Id && account.ceiling == null,
            )))
      ) {
        store.set(pendingPhoneProfileAtom, profile);
      } else {
        await enterPhoneProfile(profile, isCurrent);
      }
    },
    [jellyfin, enterPhoneProfile],
  );

  const addPhoneKid = useCallback(
    async (
      parent: PreparedProfile,
      kid: KidSignIn,
      isCurrent: () => boolean,
    ) => {
      if (
        !jellyfin ||
        !kid.user.Id ||
        !isPhoneKid(kid.user) ||
        !grantIsCurrent(parent)
      ) {
        throw new Error("A grown-up needs to unlock this profile.");
      }
      const serverUrl = parent.account.serverUrl;
      const profile = await preparePhoneProfile(
        createApiWithCustomHeaders(jellyfin, serverUrl, kid.accessToken),
        {
          serverUrl,
          userId: kid.user.Id,
          username: kid.displayName ?? kid.user.Name ?? "Kid profile",
          securityType: "none",
          savedAt: Date.now(),
        },
      );
      if (profile.account.ceiling == null || !grantIsCurrent(parent)) {
        throw new Error("A grown-up needs to unlock this profile.");
      }
      await enterPhoneProfile(
        profile,
        () => isCurrent() && grantIsCurrent(parent),
        parent,
      );
    },
    [jellyfin, enterPhoneProfile],
  );

  const cancelPendingProfile = useCallback(() => {
    const pending = store.get(pendingPhoneProfileAtom);
    if (pending) {
      lockProfile(pending);
      // A new Quick Connect token may replace the already saved session for
      // the same device. Keep that account available for a later sign-in.
      store.set(pendingPhoneProfileAtom, null);
      if (
        !profilesFor(pending.account.serverUrl).some(
          (p) => p.userId === pending.user.Id,
        )
      ) {
        void pending.api.post("/Sessions/Logout", null).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    if (!phoneProfilesEnabled) return;
    let wasBackgrounded = AppState.currentState === "background";
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") wasBackgrounded = true;
      if (state !== "active" || !wasBackgrounded) return;
      wasBackgrounded = false;
      if (
        store.get(userAtom)?.Id &&
        profilesFor(getServerUrlFromStorage()).length > 1
      ) {
        openProfileChooser();
      }
    });
    return () => subscription.remove();
  }, [openProfileChooser]);

  const headers = useMemo(() => {
    if (!deviceId) return {};
    return {
      authorization: `MediaBrowser Client="${JELLYFIN_CLIENT_NAME}", Device=${
        Platform.OS === "android" ? "Android" : "iOS"
      }, DeviceId="${deviceId}", Version="${APP_VERSION}"`,
    };
  }, [deviceId]);

  const initiateQuickConnect = useCallback(async () => {
    if (!api || !deviceId) return;
    try {
      const response = await api.axiosInstance.post(
        `${api.basePath}/QuickConnect/Initiate`,
        null,
        {
          headers,
        },
      );
      if (response?.status === 200) {
        quickConnectSecret.current = response.data.Secret;
        setSecret(response?.data?.Secret);
        setIsPolling(true);
        return response.data?.Code;
      }
      throw new Error("Failed to initiate quick connect");
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [api, deviceId, headers]);

  const stopQuickConnectPolling = useCallback(() => {
    quickConnectSecret.current = null;
    setIsPolling(false);
    setSecret(null);
  }, []);

  const pollQuickConnect = useCallback(async () => {
    if (!api || !secret || !jellyfin || exchangingSecret.current === secret)
      return;

    try {
      const response = await api.axiosInstance.get(
        `${api.basePath}/QuickConnect/Connect?Secret=${secret}`,
      );

      if (response.status === 200) {
        if (
          response.data.Authenticated &&
          quickConnectSecret.current === secret &&
          exchangingSecret.current !== secret
        ) {
          exchangingSecret.current = secret;
          setIsPolling(false);

          const authResponse = await api.axiosInstance.post(
            `${api.basePath}/Users/AuthenticateWithQuickConnect`,
            {
              secret,
            },
            {
              headers,
            },
          );

          const { AccessToken, User } = authResponse.data;
          if (quickConnectSecret.current !== secret) return false;
          if (phoneProfilesEnabled) {
            await admitPhoneSignIn(
              api.basePath,
              AccessToken,
              User,
              () => quickConnectSecret.current === secret,
            );
            return true;
          }
          setUser(User);
          setApi(
            createApiWithCustomHeaders(jellyfin, api.basePath, AccessToken),
          );
          confirmRequestPolicy(api.basePath, AccessToken, User);
          storage.set("token", AccessToken);
          storage.set("user", JSON.stringify(User));
          return true;
        }
      }
      return false;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 400 || error.response?.status === 404) {
          setIsPolling(false);
          setSecret(null);
          if (error.response?.status === 400) {
            throw new Error("The code has expired. Please try again.");
          }
          return false;
        }
      }
      if (phoneProfilesEnabled) {
        setIsPolling(false);
        toast.error(
          error instanceof AxiosError
            ? "Could not sign in. Try again."
            : error instanceof Error
              ? error.message
              : "Could not sign in. Try again.",
        );
        return false;
      }
      console.error("Error polling Quick Connect:", error);
      throw error;
    } finally {
      if (exchangingSecret.current === secret) exchangingSecret.current = null;
    }
  }, [api, secret, headers, jellyfin, admitPhoneSignIn]);

  useEffect(() => {
    (async () => {
      await refreshStreamyfinPluginSettings();
    })();
  }, []);

  useEffect(() => {
    store.set(apiAtom, api);
  }, [api]);

  useInterval(pollQuickConnect, isPolling ? 1000 : null);

  // Refresh plugin settings when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        refreshStreamyfinPluginSettings();
      }
    });

    return () => subscription.remove();
  }, []);

  const discoverServers = async (url: string): Promise<Server[]> => {
    const servers =
      await jellyfin?.discovery.getRecommendedServerCandidates(url);
    return servers?.map((server) => ({ address: server.address })) || [];
  };

  const setServerMutation = useMutation({
    mutationFn: async (server: Server) => {
      clearTVDiscoverySafely();
      const apiInstance =
        jellyfin && createApiWithCustomHeaders(jellyfin, server.address);

      if (!apiInstance?.basePath) throw new Error("Failed to connect");

      setApi(apiInstance);
      storage.set("serverUrl", server.address);
    },
    onSuccess: async (_, server) => {
      // Add server to the list (will update existing or add new)
      addServerToList(server.address);
    },
    onError: (error) => {
      console.error("Failed to set server:", error);
    },
  });

  const removeServerMutation = useMutation({
    mutationFn: async () => {
      clearTVDiscoverySafely();
      storage.remove("serverUrl");
      setApi(null);
    },
    onError: (error) => {
      console.error("Failed to remove server:", error);
    },
  });

  // Persist the CURRENT session to secure storage — used by the post-login
  // save-account modal (the protection picker shows AFTER a successful
  // login, for both the password and Quick Connect flows).
  const saveCurrentAccount = useCallback(
    async (options?: {
      securityType?: AccountSecurityType;
      pinCode?: string;
      serverName?: string;
    }) => {
      const token = storage.getString("token");
      if (!api?.basePath || !user?.Id || !user.Name || !token) return;
      const securityType = options?.securityType || "none";
      let pinHash: string | undefined;
      if (securityType === "pin") {
        // Never persist a "pin" credential without its hash — it would be
        // impossible to unlock.
        if (!options?.pinCode) throw new Error("PIN code is required");
        pinHash = await hashPIN(options.pinCode);
      }
      await saveAccountCredential({
        serverUrl: api.basePath,
        serverName: options?.serverName || "",
        token,
        userId: user.Id,
        username: user.Name,
        savedAt: Date.now(),
        securityType,
        pinHash,
        primaryImageTag: user.PrimaryImageTag ?? undefined,
      });
    },
    [api?.basePath, user],
  );

  const loginMutation = useMutation({
    mutationFn: async ({
      username,
      password,
      serverName,
      options,
    }: {
      username: string;
      password: string;
      serverName?: string;
      options?: LoginOptions;
    }) => {
      if (!api || !jellyfin) throw new Error("API not initialized");

      try {
        const auth = await api.authenticateUserByName(username, password);

        if (auth.data.AccessToken && auth.data.User) {
          if (phoneProfilesEnabled) {
            await admitPhoneSignIn(
              api.basePath,
              auth.data.AccessToken,
              auth.data.User,
            );
            return;
          }
          setUser(auth.data.User);
          storage.set("user", JSON.stringify(auth.data.User));
          setApi(
            createApiWithCustomHeaders(
              jellyfin,
              api.basePath,
              auth.data?.AccessToken,
            ),
          );
          confirmRequestPolicy(
            api.basePath,
            auth.data.AccessToken,
            auth.data.User,
          );
          storage.set("token", auth.data?.AccessToken);

          // Save credentials to secure storage if requested
          if (api.basePath && options?.saveAccount) {
            const securityType = options.securityType || "none";
            let pinHash: string | undefined;

            if (securityType === "pin" && options.pinCode) {
              pinHash = await hashPIN(options.pinCode);
            }
            if (securityType === "pin" && !pinHash) {
              // Never persist a "pin" credential without its hash — it would be
              // impossible to unlock. Skip the save rather than failing a login
              // that already succeeded, and tell the user it didn't happen.
              writeErrorLog("Account save skipped: PIN required but missing");
              toast.error(t("save_account.not_saved"));
            } else {
              await saveAccountCredential({
                serverUrl: api.basePath,
                serverName: serverName || "",
                token: auth.data.AccessToken,
                userId: auth.data.User.Id || "",
                username,
                savedAt: Date.now(),
                securityType,
                pinHash,
                primaryImageTag: auth.data.User.PrimaryImageTag ?? undefined,
              });
            }
          }

          const recentPluginSettings = await refreshStreamyfinPluginSettings();
          const pluginSeerrUrl =
            recentPluginSettings?.jellyseerrServerUrl?.value;
          if (pluginSeerrUrl && !Platform.isTV) {
            // Phones (plan 5.3 rules 1 and 8): never for a kid profile, checked
            // against this login's user; one sign-in at a time; saved only if
            // the same person is still signed in when it answers.
            if (isConfirmedAdult(auth.data.User.Id, auth.data.User)) {
              passwordSignIn({
                url: pluginSeerrUrl,
                username,
                password,
                testFirst: true,
                viewer: {
                  basePath: api.basePath,
                  accessToken: auth.data.AccessToken,
                  jellyfinUserId: auth.data.User.Id ?? null,
                },
              }).catch((e) =>
                writeErrorLog(
                  `Request server sign-in at login failed: ${e?.message ?? e}`,
                ),
              );
            }
          } else if (pluginSeerrUrl) {
            const jellyseerrApi = new JellyseerrApi(
              pluginSeerrUrl,
              getIntegrationHeaders("jellyseerr"),
            );
            await jellyseerrApi.test().then((result) => {
              if (result.isValid && result.requiresPass) {
                jellyseerrApi.login(username, password).then(setJellyseerrUser);
              }
            });
          }
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          switch (error.response?.status) {
            case 401:
              throw new Error(t("login.invalid_username_or_password"));
            case 403:
              throw new Error(
                t("login.user_does_not_have_permission_to_log_in"),
              );
            case 408:
              throw new Error(
                t("login.server_is_taking_too_long_to_respond_try_again_later"),
              );
            case 429:
              throw new Error(
                t("login.server_received_too_many_requests_try_again_later"),
              );
            case 500:
              throw new Error(t("login.there_is_a_server_error"));
            default:
              throw new Error(
                t(
                  "login.an_unexpected_error_occurred_did_you_enter_the_correct_url",
                ),
              );
          }
        }
        throw error;
      }
    },
    onError: (error) => {
      console.error("Login failed:", error);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (isPhoneKid(store.get(userAtom))) return;
      // Fire-and-forget: don't block logout on server cleanup
      api
        ?.delete(`/Streamyfin/device/${deviceId}`)
        .then((_r) => writeInfoLog("Deleted expo push token for device"))
        .catch((_e) =>
          writeErrorLog("Failed to delete expo push token for device"),
        );

      // WeaselPlex: a refused Seerr connect is forgotten on sign-out, so the
      // next sign-in tries straight away.
      if (user?.Id) clearWeaselSeerrRefusal(user.Id);
      // Request notifications (plan 5.10 step 2): removed with the outgoing
      // media token before it is discarded; bounded, so sign-out never hangs.
      await unregisterBeforeSignOut(api?.accessToken);
      await clearSessionState();
    },
    onError: (error) => {
      console.error("Logout failed:", error);
    },
  });

  const loginWithSavedCredentialMutation = useMutation({
    mutationFn: async ({
      serverUrl,
      userId,
    }: {
      serverUrl: string;
      userId: string;
    }) => {
      if (!jellyfin) throw new Error("Jellyfin not initialized");
      if (phoneProfilesEnabled) {
        const account = profilesFor(serverUrl).find(
          (profile) => profile.userId === userId,
        );
        if (!account) throw new Error("Sign this profile in again.");
        const profile = await prepareSavedProfile(account);
        store.set(pendingPhoneProfileAtom, profile);
        return;
      }

      const credential = await getAccountCredential(serverUrl, userId);
      if (!credential) {
        throw new Error("No saved credential found");
      }

      // Create API instance with saved token
      const apiInstance = createApiWithCustomHeaders(
        jellyfin,
        serverUrl,
        credential.token,
      );
      if (!apiInstance) {
        throw new Error("Failed to create API instance");
      }

      // Validate token by fetching current user
      try {
        const response = await getUserApi(apiInstance).getCurrentUser();

        // Clear React Query cache to prevent data from previous account lingering
        queryClient.clear();
        storage.remove("REACT_QUERY_OFFLINE_CACHE");

        // Token is valid, update state
        setApi(apiInstance);
        setUser(response.data);
        confirmRequestPolicy(
          apiInstance.basePath,
          credential.token,
          response.data,
        );
        storage.set("serverUrl", serverUrl);
        storage.set("token", credential.token);
        storage.set("user", JSON.stringify(response.data));

        // Update account info (in case user changed their avatar)
        if (response.data.PrimaryImageTag !== credential.primaryImageTag) {
          addAccountToServer(serverUrl, credential.serverName, {
            userId: credential.userId,
            username: credential.username,
            securityType: credential.securityType,
            savedAt: credential.savedAt,
            primaryImageTag: response.data.PrimaryImageTag ?? undefined,
          });
        }

        // Refresh plugin settings
        await refreshStreamyfinPluginSettings();
      } catch (error) {
        // Check for axios error
        if (axios.isAxiosError(error)) {
          // Token is invalid/expired - remove it
          if (
            error.response?.status === 401 ||
            error.response?.status === 403
          ) {
            await deleteAccountCredential(serverUrl, userId);
            throw new Error(t("server.session_expired"));
          }

          // Network error - server not reachable (no response means server didn't respond)
          if (!error.response) {
            throw new Error(t("home.server_unreachable"));
          }
        }

        // Check for network error by message pattern (fallback detection)
        if (
          error instanceof Error &&
          (error.message.toLowerCase().includes("network") ||
            error.message.toLowerCase().includes("econnrefused") ||
            error.message.toLowerCase().includes("timeout"))
        ) {
          throw new Error(t("home.server_unreachable"));
        }

        throw error;
      }
    },
    onError: (error) => {
      // Expected, handled case (e.g. revoked token → "Session Expired", or
      // server unreachable): the UI surfaces the message, so warn, don't error.
      console.warn("Quick login failed:", error);
    },
  });

  const loginWithPasswordMutation = useMutation({
    mutationFn: async ({
      serverUrl,
      username,
      password,
    }: {
      serverUrl: string;
      username: string;
      password: string;
    }) => {
      if (!jellyfin) throw new Error("Jellyfin not initialized");

      // Create API instance for the server
      const apiInstance = createApiWithCustomHeaders(jellyfin, serverUrl);
      if (!apiInstance) {
        throw new Error("Failed to create API instance");
      }

      // Authenticate with password
      const auth = await apiInstance.authenticateUserByName(username, password);

      if (auth.data.AccessToken && auth.data.User) {
        if (phoneProfilesEnabled) {
          await admitPhoneSignIn(
            serverUrl,
            auth.data.AccessToken,
            auth.data.User,
          );
          return;
        }
        // Clear React Query cache to prevent data from previous account lingering
        queryClient.clear();
        storage.remove("REACT_QUERY_OFFLINE_CACHE");

        setUser(auth.data.User);
        storage.set("user", JSON.stringify(auth.data.User));
        const signedInApi = createApiWithCustomHeaders(
          jellyfin,
          serverUrl,
          auth.data.AccessToken,
        );
        setApi(signedInApi);
        confirmRequestPolicy(
          signedInApi?.basePath ?? serverUrl,
          auth.data.AccessToken,
          auth.data.User,
        );
        storage.set("serverUrl", serverUrl);
        storage.set("token", auth.data.AccessToken);

        // Update the saved credential with new token and image tag
        await updateAccountToken(
          serverUrl,
          auth.data.User.Id || "",
          auth.data.AccessToken,
          auth.data.User.PrimaryImageTag ?? undefined,
        );

        // Refresh plugin settings
        await refreshStreamyfinPluginSettings();
      }
    },
    onError: (error) => {
      console.error("Password login failed:", error);
      throw error;
    },
  });

  const removeSavedCredentialMutation = useMutation({
    mutationFn: async ({
      serverUrl,
      userId,
    }: {
      serverUrl: string;
      userId: string;
    }) => {
      await deleteAccountCredential(serverUrl, userId);
      if (phoneProfilesEnabled) await forgetProfileBiometric(serverUrl, userId);
    },
    onError: (error) => {
      console.error("Failed to remove saved credential:", error);
    },
  });

  const switchServerUrl = useCallback(
    (newUrl: string) => {
      if (!jellyfin || !api?.accessToken) return;
      // Every Wi-Fi change re-evaluates the URL, and most evaluations land on
      // the URL already in use (leaving home Wi-Fi keeps the remote URL,
      // losing the network entirely does too). A new api object for the same
      // URL is not free: everything keyed on `api` refetches, and the player
      // refetched its item mid-playback, failed while offline and replaced the
      // video with its error screen.
      if (sameServerUrl(api.basePath, newUrl)) return;

      clearTVDiscoverySafely();
      const newApi = createApiWithCustomHeaders(
        jellyfin,
        newUrl,
        api.accessToken,
        undefined,
        isPhoneKid(user)
          ? (user?.Policy?.MaxParentalRating ?? undefined)
          : undefined,
      );
      setApi(newApi);
      // Note: We don't update storage.set("serverUrl") here
      // because we want to keep the original remote URL as the "primary" URL
    },
    [jellyfin, api, user],
  );

  const [loaded, setLoaded] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    if (initialLoaded) {
      setLoaded(true);
    }
  }, [initialLoaded]);

  useEffect(() => {
    const initializeJellyfin = async () => {
      if (!jellyfin) return;

      try {
        // Run migration to multi-account format (once)
        await migrateToMultiAccount();

        const token = getTokenFromStorage();
        const serverUrl = getServerUrlFromStorage();
        const storedUser = getUserFromStorage();

        if (phoneProfilesEnabled) {
          if (serverUrl && token && storedUser?.Id) {
            const account = profilesFor(serverUrl).find(
              (profile) => profile.userId === storedUser.Id,
            );
            const ceiling = storedUser.Policy?.MaxParentalRating;
            if (ceiling != null && !isKidProtected()) recordCeiling(ceiling);
            // Older Quick Connect kept the active token in MMKV even when
            // the same profile already had a different token in SecureStore.
            // Preserve the active credential when migrating to the chooser.
            const previousCredential = account
              ? await getAccountCredential(serverUrl, account.userId)
              : null;
            if (previousCredential?.token !== token) {
              await saveAccountCredential({
                ...account,
                serverUrl,
                serverName: "",
                userId: storedUser.Id,
                username: account?.username ?? storedUser.Name ?? "Profile",
                token,
                securityType: "none",
                savedAt: account?.savedAt ?? Date.now(),
                ceiling: storedUser.Policy
                  ? (ceiling ?? null)
                  : account?.ceiling,
                primaryImageTag:
                  storedUser.PrimaryImageTag ?? account?.primaryImageTag,
              });
            }
            const saved = profilesFor(serverUrl);
            if (saved.length > 1) {
              await clearSessionState();
              return;
            }
            if (saved[0]) {
              try {
                const profile = await prepareSavedProfile(saved[0]);
                if (
                  profile.pinLength ||
                  (isKidProtected() && profile.account.ceiling === null) ||
                  (profile.account.ceiling != null &&
                    requiresParent(profile.account.ceiling))
                ) {
                  await clearSessionState();
                  store.set(pendingPhoneProfileAtom, profile);
                } else {
                  await enterPhoneProfile(
                    profile,
                    () => true,
                    undefined,
                    profile.account.ceiling === (ceiling ?? null),
                  );
                }
              } catch (error) {
                // Preserve an already open, unprotected single-adult
                // session for offline browsing. Profile selection stays online.
                if (
                  axios.isAxiosError(error) &&
                  !error.response &&
                  storedUser.Policy &&
                  ceiling == null &&
                  account?.hasAccountPin === false &&
                  !isKidProtected()
                ) {
                  setApi(
                    createApiWithCustomHeaders(jellyfin, serverUrl, token),
                  );
                  setUser(storedUser);
                } else {
                  await clearSessionState();
                }
              }
            }
          }
          return;
        }

        if (serverUrl && token) {
          const apiInstance = createApiWithCustomHeaders(
            jellyfin,
            serverUrl,
            token,
            store.get(apiAtom),
          );
          if (store.get(apiAtom) !== apiInstance) setApi(apiInstance);

          if (storedUser?.Id) {
            setUser(storedUser);
          }

          // Validate the token and refresh user data in the background. Do NOT
          // await this: the Jellyfin SDK axios instance has no timeout, so when
          // offline this call hangs for the full OS TCP timeout (75-120s) and
          // blocks splash dismissal. The cached storedUser (set above) is enough
          // to render; on success we just refresh it.
          const userRefresh = getUserApi(apiInstance).getCurrentUser();
          // The request access check (plan 5.3 rule 8) waits for this same
          // answer instead of asking again.
          registerPolicyRefresh(
            policySessionKey(apiInstance.basePath, token, storedUser?.Id),
            userRefresh.then((r) => r.data),
          );
          userRefresh
            .then(async (response) => {
              // The response can resolve long after startup (no axios timeout).
              // If the session changed meanwhile (logout, account switch), drop
              // it instead of repopulating a stale user / re-saving credentials.
              if (
                getTokenFromStorage() !== token ||
                !sameServerUrl(getServerUrlFromStorage(), serverUrl)
              )
                return;
              setUser(response.data);
              // The confirmed policy decides request access, and is saved as
              // the next start's hint for the Requests tab (plan 5.3 rule 8).
              storage.set("user", JSON.stringify(response.data));
              confirmRequestPolicy(apiInstance.basePath, token, response.data);

              // Migrate current session to secure storage if not already saved
              if (storedUser?.Id && storedUser?.Name) {
                const existingCredential = await getAccountCredential(
                  serverUrl,
                  storedUser.Id,
                );
                if (!existingCredential) {
                  await saveAccountCredential({
                    serverUrl,
                    serverName: "",
                    token,
                    userId: storedUser.Id,
                    username: storedUser.Name,
                    savedAt: Date.now(),
                    securityType: "none",
                    primaryImageTag: response.data.PrimaryImageTag ?? undefined,
                  });
                } else if (
                  response.data.PrimaryImageTag !==
                  existingCredential.primaryImageTag
                ) {
                  // Update image tag if it has changed
                  addAccountToServer(serverUrl, existingCredential.serverName, {
                    userId: existingCredential.userId,
                    username: existingCredential.username,
                    securityType: existingCredential.securityType,
                    savedAt: existingCredential.savedAt,
                    primaryImageTag: response.data.PrimaryImageTag ?? undefined,
                  });
                }
              }
            })
            .catch((e) => {
              // Expected, handled case (offline, or a token the server rejects —
              // the UI prompts re-login): warn, don't error. Log only
              // status/message — never the raw error (axios errors carry the
              // request config incl. the Authorization header / token).
              console.warn(
                "Background user validation failed:",
                e?.response?.status ?? e?.message ?? "unknown error",
              );
            });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setInitialLoaded(true);
      }
    };

    initializeJellyfin();
  }, [jellyfin]);

  const contextValue: JellyfinContextValue = {
    discoverServers,
    setServer: (server) => setServerMutation.mutateAsync(server),
    removeServer: () => removeServerMutation.mutateAsync(),
    login: (username, password, serverName, options) =>
      loginMutation.mutateAsync({ username, password, serverName, options }),
    saveCurrentAccount,
    logout: () => logoutMutation.mutateAsync(),
    initiateQuickConnect,
    stopQuickConnectPolling,
    loginWithSavedCredential: (serverUrl, userId) =>
      loginWithSavedCredentialMutation.mutateAsync({ serverUrl, userId }),
    loginWithPassword: (serverUrl, username, password) =>
      loginWithPasswordMutation.mutateAsync({ serverUrl, username, password }),
    removeSavedCredential: (serverUrl, userId) =>
      removeSavedCredentialMutation.mutateAsync({ serverUrl, userId }),
    switchServerUrl,
    openProfileChooser,
    prepareSavedProfile,
    enterPhoneProfile,
    addPhoneKid,
    cancelPendingProfile,
  };

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useProtectedRoute(user, loaded);

  return (
    <JellyfinContext.Provider value={contextValue}>
      {children}
    </JellyfinContext.Provider>
  );
};

export const useJellyfin = (): JellyfinContextValue => {
  const context = useContext(JellyfinContext);
  if (!context)
    throw new Error("useJellyfin must be used within a JellyfinProvider");
  return context;
};

function useProtectedRoute(user: UserDto | null, loaded = false) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loaded === false) return;

    const inAuthGroup = segments.length > 1 && segments[0] === "(auth)";
    const isTopShelfLaunchRoute = segments[0] === "topshelf";

    if (!user?.Id && inAuthGroup) {
      router.replace("/login");
    } else if (
      user?.Id &&
      ((!inAuthGroup && !isTopShelfLaunchRoute) ||
        (isPhoneKid(user) && isAdultOnlyRoute(segments)))
    ) {
      router.replace("/(auth)/(tabs)/(home)/");
    }
  }, [user, segments, loaded]);
}

export function getTokenFromStorage(): string | null {
  return storage.getString("token") || null;
}

export function getUserFromStorage(): UserDto | null {
  const userStr = storage.getString("user");
  if (userStr) {
    try {
      return JSON.parse(userStr) as UserDto;
    } catch (e) {
      console.error(e);
    }
  }
  return null;
}

export function getServerUrlFromStorage(): string | null {
  return storage.getString("serverUrl") || null;
}
