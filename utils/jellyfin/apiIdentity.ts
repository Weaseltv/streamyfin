import type { Api, Jellyfin } from "@jellyfin/sdk";

/** Credentials and SDK identity must all match before reusing a session API. */
export const isEquivalentSessionApi = (
  api: Api | null | undefined,
  jellyfin: Jellyfin,
  serverUrl: string,
  accessToken = "",
): boolean =>
  !!api &&
  api.basePath.replace(/\/+$/, "") === serverUrl.replace(/\/+$/, "") &&
  api.accessToken === accessToken &&
  api.clientInfo.name === jellyfin.clientInfo.name &&
  api.clientInfo.version === jellyfin.clientInfo.version &&
  api.deviceInfo.id === jellyfin.deviceInfo.id &&
  api.deviceInfo.name === jellyfin.deviceInfo.name;
