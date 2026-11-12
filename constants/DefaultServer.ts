/**
 * The WeaselPlex server this build signs in to.
 *
 * On phones this is a LOCK, not a pre-fill (owner decision, 2026-10-02): the
 * only sign-in screen is "Connect to your account", which connects here and
 * approves the code on theweasel.tv. There is no server field. The app is
 * distributed through TestFlight and direct download, not the App Store, so
 * the owner accepted that an app reaching only one server reads as a service.
 * Don't bring back a server field or password sign-in without asking.
 * (TV builds still pre-fill TVAddServerForm with it.)
 *
 * Referenced as a full `process.env.EXPO_PUBLIC_*` member expression on purpose:
 * Expo inlines these textually at build time, so destructuring or computing the
 * key would leave it `undefined` in a release build.
 */
export const DEFAULT_SERVER_URL: string = (
  process.env.EXPO_PUBLIC_DEFAULT_SERVER ?? ""
).trim();
