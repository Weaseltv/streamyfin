import type { Api, Jellyfin } from "@jellyfin/sdk";
import axios from "axios";
import { Deadlines } from "@/constants/networkDeadlines";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { isEquivalentSessionApi } from "./apiIdentity";
import { installKidContentGuard } from "./kidContentGuard";

const managedApis = new WeakMap<Api, number | undefined>();

function createSessionClient(serverUrl: string) {
  const client = axios.create({ timeout: Deadlines.negotiation });
  client.interceptors.request.use((config) => {
    const url = client.getUri({
      ...config,
      baseURL: config.baseURL ?? serverUrl,
    });
    const headers = getJellyfinHeadersForUrl(url, serverUrl);
    for (const [key, value] of Object.entries(headers ?? {})) {
      config.headers.set(key, value);
    }
    return config;
  });
  return client;
}

/**
 * Creates a Jellyfin `Api` whose every request carries the custom proxy auth
 * headers configured for that server (Cloudflare Access, Pangolin, ...).
 *
 * The interceptor belongs here rather than in a provider effect: `apiAtom`
 * starts out holding a live `Api`, and child effects run before parent effects,
 * so the first queries of a cold start would fire before an effect-installed
 * interceptor existed and be rejected by the gateway.
 *
 * Headers are read per request (they are memoized until the configuration
 * changes), so an edit in settings applies without recreating the `Api`.
 * A kid's Jellyfin parental rating is pinned to the same session as the token.
 * Undefined means adult; NaN means a kid whose ceiling is unknown.
 */
export function createApiWithCustomHeaders(
  jellyfin: Jellyfin,
  serverUrl: string,
  accessToken?: string,
  existingApi?: Api | null,
  kidCeiling?: number,
): Api {
  if (
    existingApi &&
    managedApis.has(existingApi) &&
    Object.is(managedApis.get(existingApi), kidCeiling) &&
    isEquivalentSessionApi(existingApi, jellyfin, serverUrl, accessToken)
  )
    return existingApi;

  // SDK defaults share the global Axios client. A new session needs its own
  // interceptor; otherwise recreating APIs accumulates callbacks for old servers.
  // The SDK leaves this unset, which means "wait forever". A server that
  // accepts the connection but never answers would otherwise hang Play, a
  // track switch or session cleanup with no recovery. Individual calls can
  // still pass a tighter or looser timeout; this is only the ceiling.
  const basePath = serverUrl.replace(/\/$/, "");
  const api = jellyfin.createApi(
    serverUrl,
    accessToken,
    createSessionClient(basePath),
  );
  if (kidCeiling !== undefined) {
    installKidContentGuard(api, createSessionClient(api.basePath), kidCeiling);
  }
  managedApis.set(api, kidCeiling);
  return api;
}
