import type { Api, Jellyfin } from "@jellyfin/sdk";
import axios from "axios";
import { Deadlines } from "@/constants/networkDeadlines";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { isEquivalentSessionApi } from "./apiIdentity";

const managedApis = new WeakSet<Api>();

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
 */
export function createApiWithCustomHeaders(
  jellyfin: Jellyfin,
  serverUrl: string,
  accessToken?: string,
  existingApi?: Api | null,
): Api {
  if (
    existingApi &&
    managedApis.has(existingApi) &&
    isEquivalentSessionApi(existingApi, jellyfin, serverUrl, accessToken)
  )
    return existingApi;

  // SDK defaults share the global Axios client. A new session needs its own
  // interceptor; otherwise recreating APIs accumulates callbacks for old servers.
  const api = jellyfin.createApi(serverUrl, accessToken, axios.create());

  // The SDK leaves this unset, which means "wait forever". A server that
  // accepts the connection but never answers would otherwise hang Play, a
  // track switch or session cleanup with no recovery. Individual calls can
  // still pass a tighter or looser timeout; this is only the ceiling.
  api.axiosInstance.defaults.timeout = Deadlines.negotiation;

  api.axiosInstance.interceptors.request.use((config) => {
    const url = api.axiosInstance.getUri({
      ...config,
      baseURL: config.baseURL ?? api.basePath,
    });
    const headers = getJellyfinHeadersForUrl(url, api.basePath);
    for (const [key, value] of Object.entries(headers ?? {})) {
      config.headers.set(key, value);
    }
    return config;
  });

  managedApis.add(api);
  return api;
}
