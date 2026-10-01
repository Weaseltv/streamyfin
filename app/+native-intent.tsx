import { isWeaselPlexConnectReturn } from "@/utils/weaselPlexConnect";

/**
 * Maps system links to routes before expo-router handles them.
 *
 * `weaselfin://connected` is the return link of "Sign in with theweasel.tv".
 * iOS hands it straight back to the auth session, but Android also delivers
 * it as a link; without this mapping the router would open "not found" while
 * the login screen is still finishing the Quick Connect sign-in.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  return isWeaselPlexConnectReturn(path) ? "/login" : path;
}
