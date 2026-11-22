/**
 * Pure helpers for the Android phone player chrome (no React Native imports,
 * so they run under `bun test`). Values mirror WeaselPlex's iOS player.
 */

/** iOS PlayerViewModel.sleepTimerPresetMinutes. */
export const SLEEP_TIMER_PRESET_MINUTES = [15, 30, 45, 60, 90, 120] as const;

/** iOS PlayerViewModel.subtitleScalePresets. */
export const SUBTITLE_SCALE_PRESETS = [
  0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0,
] as const;

/** iOS PlayerViewModel.syncOffsetPresets: audio and subtitle sync, seconds. */
export const SYNC_OFFSET_PRESETS = [
  -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5,
] as const;

/** iOS PlayerViewModel.volumeBoostPresets: percent, 100 = off. */
export const VOLUME_BOOST_PRESETS = [100, 125, 150, 200] as const;

/** iOS offsetLabel: "0 s", "+0.25 s", "-5 s" (`%+g s`). */
export const syncOffsetLabel = (seconds: number): string => {
  if (seconds === 0) return "0 s";
  const value = Number(seconds.toFixed(3));
  return `${value > 0 ? "+" : ""}${value} s`;
};

/** iOS boostLabel: the "off" string at 100, else "125%". */
export const volumeBoostLabel = (percent: number, offLabel: string): string =>
  percent === 100 ? offLabel : `${percent}%`;

/** "1×", "0.25×": iOS speedLabel / scaleLabel (`%g×`). */
export const multiplierLabel = (value: number): string =>
  `${Number(value.toFixed(2))}×`;

/** iOS sleepTimerLabel: "15 min" under an hour, "1.5 h" from an hour. */
export const sleepTimerLabel = (minutes: number): string =>
  minutes < 60 ? `${minutes} min` : `${Number((minutes / 60).toFixed(2))} h`;

/** iOS formatTime: "H:MM:SS" from an hour, "M:SS" under. Takes seconds. */
export const formatPlayerTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const ss = secs.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${ss}`;
  }
  return `${minutes}:${ss}`;
};

/** iOS endsAtFormatter: a fixed 24-hour "HH:mm". */
export const formatClockTime = (date: Date): string =>
  `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

export type CenterDensity = "regular" | "compact" | "dense";

export interface CenterRowMetrics {
  density: CenterDensity;
  spacing: number;
  sideButton: number;
  playButton: number;
  /** Material glyph sizes: the SF Symbol font sizes × ≈ 4/3, because
   * Material draws its glyph inside a padded box. */
  seekIcon: number;
  jumpIcon: number;
  playIcon: number;
  showEpisodeButtons: boolean;
}

const tierMetrics = (
  density: CenterDensity,
  hasChapters: boolean,
): Omit<CenterRowMetrics, "showEpisodeButtons"> => {
  switch (density) {
    case "regular":
      return {
        density,
        spacing: hasChapters ? 24 : 36,
        sideButton: 56,
        playButton: 80,
        seekIcon: 40,
        jumpIcon: 29,
        playIcon: 66,
      };
    case "compact":
      return {
        density,
        spacing: hasChapters ? 14 : 24,
        sideButton: 48,
        playButton: 68,
        seekIcon: 35,
        jumpIcon: 25,
        playIcon: 55,
      };
    default:
      return {
        density,
        spacing: 10,
        sideButton: 40,
        playButton: 56,
        seekIcon: 29,
        jumpIcon: 22,
        playIcon: 47,
      };
  }
};

/**
 * PlayerCenterControls.swift's ViewThatFits: the first density tier whose
 * row fits `availableWidth`, dropping the episode buttons as a last resort.
 */
export const pickCenterRow = ({
  availableWidth,
  hasChapters,
  isEpisode,
}: {
  availableWidth: number;
  hasChapters: boolean;
  isEpisode: boolean;
}): CenterRowMetrics => {
  const tiers: { density: CenterDensity; episodes: boolean }[] = [
    { density: "regular", episodes: true },
    { density: "compact", episodes: true },
    { density: "dense", episodes: true },
    { density: "dense", episodes: false },
  ];
  let picked: CenterRowMetrics | undefined;
  for (const tier of tiers) {
    const showEpisodeButtons = tier.episodes && isEpisode;
    const m = tierMetrics(tier.density, hasChapters);
    // Buttons other than play/pause; one gap per side button.
    const sides = 2 + (hasChapters ? 2 : 0) + (showEpisodeButtons ? 2 : 0);
    picked = { ...m, showEpisodeButtons };
    if (sides * (m.sideButton + m.spacing) + m.playButton <= availableWidth) {
      break;
    }
  }
  return picked!;
};
