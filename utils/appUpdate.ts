/** How long "Not now" keeps the update popup away. Matches WeaselPlex TV. */
export const UPDATE_PROMPT_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** MMKV key holding when the update popup last showed (epoch ms). */
export const UPDATE_PROMPT_SHOWN_AT_KEY = "appUpdate.promptShownAt";

/**
 * Whether the launch-time check may show the update popup again. A clock that moved
 * backwards counts as due, so the popup can't be silenced indefinitely.
 */
export function isUpdatePromptDue(
  lastShownAt: number | undefined,
  now: number,
): boolean {
  if (!lastShownAt) return true;
  return now < lastShownAt || now - lastShownAt >= UPDATE_PROMPT_INTERVAL_MS;
}

/** Whole-number download percentage, clamped to 0–100. */
export function downloadPercent(downloaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((downloaded / total) * 100)));
}

/** What the publish script used to write when given no notes. Never shown. */
const PLACEHOLDER_NOTE = "Agent stable publish";

/**
 * Splits signed release notes the way WeaselPlex TV lays out its release text: the
 * first entry is a one-line summary, every later entry is a bullet point.
 */
export function splitReleaseNotes(notes: readonly string[]): {
  summary: string | null;
  bullets: string[];
} {
  const real = notes
    .map((note) => note.trim())
    .filter((note) => note.length > 0 && note !== PLACEHOLDER_NOTE);
  return { summary: real[0] ?? null, bullets: real.slice(1) };
}
