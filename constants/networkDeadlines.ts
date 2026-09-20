/**
 * Request deadlines, in milliseconds.
 *
 * The Jellyfin SDK's axios instance shipped with no timeout at all, so a server
 * that was reachable but unresponsive — connected Wi-Fi, blackholed host, a
 * stalled reverse proxy — left Play spinning indefinitely with no way back.
 * A connected network icon is not evidence the server will answer.
 *
 * These are starting values to calibrate against real slow-transcode startups,
 * not SLA promises. Long transfers (downloads, media itself) are governed
 * separately and must never inherit these.
 */
export const Deadlines = {
  /**
   * Ordinary metadata reads. Generous enough for a cold large library, short
   * enough that a dead server surfaces as an error rather than a spinner.
   */
  metadata: 10_000,
  /**
   * PlaybackInfo negotiation. Longer than metadata because the server may be
   * spinning up a transcode before it answers.
   */
  negotiation: 20_000,
  /**
   * Fire-and-forget progress/stop telemetry. Deliberately short: nothing the
   * user can see depends on it, and it must never hold up teardown.
   */
  reporting: 3_000,
} as const;
