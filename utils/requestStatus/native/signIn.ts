/**
 * Request-server password sign-ins on phones (plan 5.3 rule 1): the Settings sign-in and the
 * plugin sign-in at media-server login. Each runs through the one exchange queue, stores nothing
 * while it runs, and is saved only if it is still the current exchange and the same viewer is
 * still signed in to the same media server.
 */
import { JellyseerrApi, storeJellyseerrUser } from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import type { User as JellyseerrUser } from "@/utils/jellyseerr/server/entity/User";
import { writeInfoLog } from "@/utils/log";
import { store } from "@/utils/store";
import { seerrExchanges } from "../exchangeQueue";
import { isPinnedOrigin, normalizeOrigin } from "../session";
import { normalizeJellyfinId } from "../visibility";
import { noteExchangeSucceeded, saveBinding } from "./runtime";

export interface ViewerSnapshot {
  basePath: string | null;
  accessToken: string | null;
  jellyfinUserId: string | null;
}

/** The media-server session right now. */
export function currentViewer(): ViewerSnapshot {
  const api = store.get(apiAtom);
  const user = store.get(userAtom);
  return {
    basePath: api?.basePath ?? null,
    accessToken: api?.accessToken ?? null,
    jellyfinUserId: user?.Id ?? null,
  };
}

/** The same person is still signed in to the same media server with the same session. */
export function sameViewer(
  a: ViewerSnapshot,
  b: ViewerSnapshot = currentViewer(),
): boolean {
  return (
    !!a.jellyfinUserId &&
    a.basePath === b.basePath &&
    a.accessToken === b.accessToken &&
    normalizeJellyfinId(a.jellyfinUserId) ===
      normalizeJellyfinId(b.jellyfinUserId)
  );
}

export type PasswordSignInResult =
  | { kind: "signed_in"; user: JellyseerrUser }
  /** Superseded by a newer sign-in, or the viewer changed meanwhile: nothing was saved. */
  | { kind: "stale" }
  /** The server does not take a password sign-in (already signed in, or not a valid server). */
  | { kind: "skipped" };

/**
 * Sign in to a request server with the media-server user's name and password, through the
 * exchange queue. Saves the user (and, for another server whose account has no media-server
 * link, the binding rule 3 needs) only when still current. Throws on a failed sign-in.
 */
export async function passwordSignIn(input: {
  url: string;
  username: string;
  password: string;
  viewer: ViewerSnapshot;
  headers?: Record<string, string>;
  /** Run the server test first and skip when it says no password is needed. */
  testFirst?: boolean;
  /** Runs just before the user is saved (the Settings page saves the server URL first). */
  beforeSave?: () => void;
}): Promise<PasswordSignInResult> {
  const outcome = await seerrExchanges.run(async ({ signal, isCurrent }) => {
    const api = new JellyseerrApi(
      input.url,
      input.headers ?? getIntegrationHeaders("jellyseerr"),
      {
        signal,
        isCurrent,
      },
    );
    if (input.testFirst) {
      const result = await api.test();
      if (!(result.isValid && result.requiresPass)) return null;
    }
    return api.login(input.username, input.password, { store: false });
  });
  if (!outcome.current || !sameViewer(input.viewer)) return { kind: "stale" };
  if (!outcome.result) return { kind: "skipped" };
  const user = outcome.result;
  input.beforeSave?.();
  storeJellyseerrUser(user);
  if (
    !isPinnedOrigin(input.url) &&
    !user.jellyfinUserId &&
    input.viewer.jellyfinUserId
  ) {
    saveBinding({
      jellyfinUserId: input.viewer.jellyfinUserId,
      origin: normalizeOrigin(input.url),
      seerrUserId: user.id,
    });
  }
  noteExchangeSucceeded(input.viewer.jellyfinUserId, input.url, user);
  writeInfoLog("Signed in to the request server");
  return { kind: "signed_in", user };
}
