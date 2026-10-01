/**
 * "Sign in with theweasel.tv" for the phone app.
 *
 * The phone asks WeaselPlex for a Quick Connect code, then opens the website's
 * approve page in an auth session. The customer signs in there with their
 * theweasel.tv account, the page approves the code, and the site sends the
 * browser back to the app through the return link below. No WeaselPlex
 * password is ever typed into the phone.
 *
 * Kept free of react-native imports so it runs under `bun test`.
 */

/** Must match the website's return-link allow-list exactly. */
export const WEASELPLEX_CONNECT_RETURN_URL = "weaselfin://connected";

const WEASELPLEX_CONNECT_PAGE = "https://theweasel.tv/weaselplex/connect";

/** The device word the approve page shows ("Approve this iPhone?"). */
export function weaselPlexConnectDevice(os: string, isPad: boolean): string {
  if (os === "android") return "android";
  if (os === "ios") return isPad ? "ipad" : "iphone";
  return "phone";
}

/** The approve page for a six-digit Quick Connect `code` issued to this phone. */
export function weaselPlexConnectUrl(code: string, device: string): string {
  const query = [
    ["code", code],
    ["device", device],
    ["return", WEASELPLEX_CONNECT_RETURN_URL],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${WEASELPLEX_CONNECT_PAGE}?${query}`;
}

/**
 * True when a system link is the approve page's return link, so the router
 * keeps the customer on the login screen instead of showing "not found".
 */
export function isWeaselPlexConnectReturn(path: string): boolean {
  const stripped = path
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^\/+/, "");
  const first = stripped.split(/[/?#]/)[0]?.toLowerCase();
  return first === "connected";
}
