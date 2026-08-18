/**
 * The Jellyfin server this build points at out of the box.
 *
 * 🛑 This is a PRE-FILL, never a lock. The server field stays editable on every
 * platform. An iOS client that can only ever reach one server reads to App Review
 * as a *service* rather than a general-purpose tool, which forfeits the
 * generic-client position that gets self-hosted clients approved. Seeding the
 * input is enough to spare our own customers from typing a URL.
 *
 * Referenced as a full `process.env.EXPO_PUBLIC_*` member expression on purpose:
 * Expo inlines these textually at build time, so destructuring or computing the
 * key would leave it `undefined` in a release build.
 */
export const DEFAULT_SERVER_URL: string = (
  process.env.EXPO_PUBLIC_DEFAULT_SERVER ?? ""
).trim();
