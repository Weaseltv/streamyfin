/**
 * How this app identifies itself to Jellyfin.
 *
 * This string is what appears in Jellyfin's Devices and Sessions lists and in
 * the `MediaBrowser Client="..."` authorization header. Keep it in one place so
 * the header and the SDK's clientInfo can never disagree.
 *
 * Not to be confused with the `/Streamyfin/...` API routes or the
 * `StreamyfinPluginSettings` names elsewhere in the app. Those address the
 * Streamyfin Jellyfin plugin and are wire format, not branding.
 */
export const JELLYFIN_CLIENT_NAME = "WeaselFin";
