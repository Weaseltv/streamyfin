/**
 * Quick Connect for signing a kid in (contract 5.4 steps 4 and 6, and 12.3). Port of the TV's
 * `kids/KidQuickConnect.kt`. Every call uses its own client, never the app's signed-in `Api`, so
 * nothing about the current session changes until the kid's sign-in is handed to the caller.
 */
import { type Api, Jellyfin } from "@jellyfin/sdk";
import {
  getQuickConnectApi,
  getSessionApi,
  getUserApi,
} from "@jellyfin/sdk/lib/utils/api";
import { isAxiosError } from "axios";
import { createApiWithCustomHeaders } from "@/utils/jellyfin/createApi";
import type { KidQuickConnect, KidSignIn } from "./addKidController";

/** The sign-in's own timeout; its caller never cancels it, so a response that arrived is read. */
const AUTHENTICATE_TIMEOUT_MS = 15_000;
const SIGN_OUT_TIMEOUT_MS = 5_000;

/**
 * Quick Connect against `parent`'s server, with the same app and device identity (as the TV does),
 * but unauthenticated: the grown-up's token is never sent to these routes.
 */
export function createKidQuickConnect(parent: Api): KidQuickConnect {
  const jellyfin = new Jellyfin({
    clientInfo: parent.clientInfo,
    deviceInfo: parent.deviceInfo,
  });
  const serverUrl = parent.basePath;
  const anonymous = () => createApiWithCustomHeaders(jellyfin, serverUrl);

  return {
    async initiate() {
      const { data } = await getQuickConnectApi(
        anonymous(),
      ).initiateQuickConnect();
      if (!data.Code || !data.Secret)
        throw new Error("Quick Connect gave no code");
      return { code: data.Code, secret: data.Secret };
    },

    async isAuthenticated(secret) {
      const { data } = await getQuickConnectApi(
        anonymous(),
      ).getQuickConnectState({
        secret,
      });
      return data.Authenticated === true;
    },

    async poll(secret) {
      try {
        const { data } = await getQuickConnectApi(
          anonymous(),
        ).getQuickConnectState({ secret });
        return data.Authenticated ? "authenticated" : "waiting";
      } catch (error) {
        // "Unknown secret": Jellyfin drops a request once it expires (10 minutes) or signs in.
        if (isAxiosError(error) && error.response?.status === 404)
          return "expired";
        throw error;
      }
    },

    async authenticate(secret): Promise<KidSignIn> {
      const { data } = await getUserApi(
        anonymous(),
      ).authenticateWithQuickConnect(
        { quickConnectDto: { Secret: secret } },
        { timeout: AUTHENTICATE_TIMEOUT_MS },
      );
      if (!data.AccessToken || !data.User)
        throw new Error("Quick Connect sign-in returned nothing");
      return { accessToken: data.AccessToken, user: data.User };
    },

    async signOut(accessToken) {
      try {
        await getSessionApi(
          createApiWithCustomHeaders(jellyfin, serverUrl, accessToken),
        ).reportSessionEnded({ timeout: SIGN_OUT_TIMEOUT_MS });
      } catch {
        console.warn("Couldn't sign a Quick Connect sign-in out");
      }
    },
  };
}
