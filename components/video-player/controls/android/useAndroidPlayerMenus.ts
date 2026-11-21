import type { MaterialIcons } from "@expo/vector-icons";
import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { BITRATES } from "@/components/BitrateSelector";
import type { ActionOption, OptionGroup } from "@/components/PlatformDropdown";
import { PLAYBACK_SPEEDS } from "@/components/PlaybackSpeedSelector";
import useRouter from "@/hooks/useAppRouter";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import {
  formatPlayerTime,
  multiplierLabel,
  SLEEP_TIMER_PRESET_MINUTES,
  SUBTITLE_SCALE_PRESETS,
  SYNC_OFFSET_PRESETS,
  sleepTimerLabel,
  syncOffsetLabel,
  VOLUME_BOOST_PRESETS,
  volumeBoostLabel,
} from "@/utils/androidPlayerChrome";
import { useSettings } from "@/utils/atoms/settings";
import { ticksToMs } from "@/utils/time";
import { usePlayerContext } from "../contexts/PlayerContext";
import { useVideoContext } from "../contexts/VideoContext";
import { PlaybackSpeedScope } from "../utils/playback-speed-settings";
import {
  keepAudioAdjustmentsForReload,
  usePlayerAudioAdjustments,
} from "./usePlayerAudioAdjustments";

/**
 * The Android menu card (parity round 2, Q2) draws a Material icon on an
 * action or a titled group's row, like the iPhone's "…" menu, and
 * `showSelection: false` draws a submenu row as just "Title ›" (the
 * iPhone's "Speed ›") instead of "Title: Selected". The intersections keep
 * this file compiling whether or not PlatformDropdown declares the fields
 * yet; elsewhere they are ignored.
 */
type IconName = keyof typeof MaterialIcons.glyphMap;
type IconGroup = OptionGroup & { icon?: IconName; showSelection?: boolean };
type IconAction = ActionOption & { icon?: IconName };

interface Params {
  /** Portrait phones fold zoom + speed into the More menu (iOS compact). */
  compact: boolean;
  isZoomedToFill: boolean;
  onZoomToggle?: () => void;
  playbackSpeed: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  showTechnicalInfo: boolean;
  onToggleTechnicalInfo?: () => void;
  chapters?: ChapterInfo[] | null;
  /** Seek to a position in milliseconds. */
  seekTo: (ms: number) => void;
  /** Current position in ticks, so a quality change resumes where you are. */
  getPositionTicks?: () => number;
  sleepTimerMinutes: number | null;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  onRotate: () => void;
  onLockControls: () => void;
}

export interface AndroidPlayerMenus {
  audio: OptionGroup[];
  subtitles: OptionGroup[];
  /** The landscape top bar's own speed button (iOS speedMenu). */
  speed: OptionGroup[];
  more: OptionGroup[];
}

// The iPhone player's Speed menu offers 0.25x to 2x (PlayerTopBar.swift).
// Android matches it (owner, round 2 parity review, Q1); Settings keeps the
// longer list for the default speed.
const PLAYER_MENU_SPEEDS = PLAYBACK_SPEEDS.filter((speed) => speed.value <= 2);

/**
 * The iPhone player's menus (PlayerTopBar.swift) as PlatformDropdown groups:
 * the audio and subtitle buttons get their own menus, and "…" carries the
 * rest in the iOS order. A titled radio group is a "Title: Selected" row that
 * opens its choices, the dropdown's version of an iOS submenu.
 */
export const useAndroidPlayerMenus = ({
  compact,
  isZoomedToFill,
  onZoomToggle,
  playbackSpeed,
  setPlaybackSpeed,
  showTechnicalInfo,
  onToggleTechnicalInfo,
  chapters,
  seekTo,
  getPositionTicks,
  sleepTimerMinutes,
  setSleepTimer,
  cancelSleepTimer,
  onRotate,
  onLockControls,
}: Params): AndroidPlayerMenus => {
  const { t } = useTranslation();
  const { subtitleTracks, audioTracks } = useVideoContext();
  const { item, mediaSource } = usePlayerContext();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const isOffline = useOfflineMode();
  const {
    values: adjustmentValues,
    setAudioDelay,
    setSubtitleDelay,
    setVolumeBoost,
    toggleDialogueBoost,
    toggleMonoAudio,
  } = usePlayerAudioAdjustments();

  const { subtitleIndex, audioIndex, bitrateValue, playbackPosition } =
    useLocalSearchParams<{
      audioIndex: string;
      subtitleIndex: string;
      bitrateValue: string;
      playbackPosition: string;
    }>();

  // Refs keep the quality handler stable while the position param moves.
  const playbackPositionRef = useRef(playbackPosition);
  playbackPositionRef.current = playbackPosition;
  const itemIdRef = useRef(item.Id);
  itemIdRef.current = item.Id;
  const mediaSourceIdRef = useRef(mediaSource?.Id);
  mediaSourceIdRef.current = mediaSource?.Id;

  const getPositionTicksRef = useRef(getPositionTicks);
  getPositionTicksRef.current = getPositionTicks;

  // Same reload the old options sheet did (DropdownView.changeBitrate), but
  // from the current position like the iPhone: the old sheet restarted from
  // wherever the player had been opened.
  const changeBitrate = useCallback(
    (bitrate: string) => {
      const queryParams = new URLSearchParams({
        itemId: itemIdRef.current ?? "",
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex?.toString() ?? "",
        mediaSourceId: mediaSourceIdRef.current ?? "",
        bitrateValue: bitrate.toString(),
        playbackPosition:
          getPositionTicksRef.current?.().toString() ??
          playbackPositionRef.current,
      }).toString();
      keepAudioAdjustmentsForReload();
      router.replace(`player/direct-player?${queryParams}` as any);
    },
    [audioIndex, subtitleIndex, router],
  );

  const subtitleTracksKey =
    subtitleTracks?.map((s) => `${s.index}-${s.name}`).join(",") ?? "";
  const audioTracksKey =
    audioTracks?.map((a) => `${a.index}-${a.name}`).join(",") ?? "";

  // iOS syncOffsetEntries: one checkmarked row per preset.
  const syncOffsetOptions = useCallback(
    (current: number, onSelect: (seconds: number) => void) =>
      SYNC_OFFSET_PRESETS.map((offset) => ({
        type: "radio" as const,
        label: syncOffsetLabel(offset),
        value: offset.toString(),
        selected: Math.abs(current - offset) < 0.001,
        onPress: () => onSelect(offset),
      })),
    [],
  );

  // iOS audioTracksMenu: the tracks, then Audio sync ›, Volume boost ›,
  // Dialogue boost and Mono audio (whose icons turn into a checkmark while
  // on, like the iPhone's).
  const audio = useMemo<IconGroup[]>(() => {
    if (!audioTracks || audioTracks.length === 0) return [];
    const dialogueBoost: IconAction = {
      type: "action",
      label: t("player.dialogue_boost"),
      icon: adjustmentValues.dialogueBoost ? "check" : "volume-down",
      onPress: toggleDialogueBoost,
    };
    const monoAudio: IconAction = {
      type: "action",
      label: t("player.mono_audio"),
      icon: adjustmentValues.monoAudio ? "check" : "volume-mute",
      onPress: toggleMonoAudio,
    };
    return [
      {
        options: audioTracks.map((track) => ({
          type: "radio" as const,
          label: track.name,
          value: track.index.toString(),
          selected: audioIndex === track.index.toString(),
          onPress: () => track.setTrack(),
        })),
      },
      {
        title: t("player.audio_sync"),
        icon: "update",
        showSelection: false,
        options: syncOffsetOptions(adjustmentValues.audioDelay, setAudioDelay),
      },
      {
        title: t("player.volume_boost"),
        icon: "volume-up",
        showSelection: false,
        options: VOLUME_BOOST_PRESETS.map((percent) => ({
          type: "radio" as const,
          // The iPhone's "off" string is common.none (buildNativePlayerConfig).
          label: volumeBoostLabel(percent, t("common.none")),
          value: percent.toString(),
          selected: adjustmentValues.volumeBoost === percent,
          onPress: () => setVolumeBoost(percent),
        })),
      },
      { options: [dialogueBoost, monoAudio] },
    ];
  }, [
    t,
    audioTracksKey,
    audioIndex,
    adjustmentValues,
    syncOffsetOptions,
    setAudioDelay,
    setVolumeBoost,
    toggleDialogueBoost,
    toggleMonoAudio,
  ]);

  const subtitles = useMemo<IconGroup[]>(() => {
    if (!subtitleTracks || subtitleTracks.length === 0) return [];
    const currentScale = settings.mpvSubtitleScale ?? 1.0;
    return [
      {
        options: subtitleTracks.map((sub) => ({
          type: "radio" as const,
          // The iPhone names the off row "None".
          label: sub.index === -1 ? t("common.none") : sub.name,
          value: sub.index.toString(),
          selected: subtitleIndex === sub.index.toString(),
          onPress: () => sub.setTrack(),
        })),
      },
      {
        title: t("player.menu.subtitle_scale"),
        icon: "format-size",
        showSelection: false,
        options: SUBTITLE_SCALE_PRESETS.map((preset) => ({
          type: "radio" as const,
          label: multiplierLabel(preset),
          value: preset.toString(),
          selected: Math.abs(currentScale - preset) < 0.001,
          onPress: () => updateSettings({ mpvSubtitleScale: preset }),
        })),
      },
      {
        title: t("player.subtitle_sync"),
        icon: "update",
        showSelection: false,
        options: syncOffsetOptions(
          adjustmentValues.subtitleDelay,
          setSubtitleDelay,
        ),
      },
    ];
  }, [
    t,
    subtitleTracksKey,
    subtitleIndex,
    settings.mpvSubtitleScale,
    updateSettings,
    adjustmentValues.subtitleDelay,
    syncOffsetOptions,
    setSubtitleDelay,
  ]);

  const speedOptions = useMemo(
    () =>
      setPlaybackSpeed
        ? PLAYER_MENU_SPEEDS.map((speed) => ({
            type: "radio" as const,
            label: multiplierLabel(speed.value),
            value: speed.value.toString(),
            selected: Math.abs(playbackSpeed - speed.value) < 0.001,
            onPress: () =>
              setPlaybackSpeed(speed.value, PlaybackSpeedScope.All),
          }))
        : [],
    [playbackSpeed, setPlaybackSpeed],
  );

  const speed = useMemo<OptionGroup[]>(
    () => (speedOptions.length > 0 ? [{ options: speedOptions }] : []),
    [speedOptions],
  );

  const chapterKey =
    chapters?.map((c) => `${c.StartPositionTicks}-${c.Name}`).join(",") ?? "";

  const more = useMemo<IconGroup[]>(() => {
    const groups: IconGroup[] = [];

    // Toggles are actions here so they can carry the iPhone's icon, which
    // turns into a checkmark while the option is on.
    if (compact && onZoomToggle) {
      const zoom: IconAction = {
        type: "action",
        label: t("player.zoom_to_fill"),
        icon: isZoomedToFill ? "check" : "open-in-full",
        onPress: onZoomToggle,
      };
      groups.push({ options: [zoom] });
    }

    if (compact && speedOptions.length > 0) {
      groups.push({
        title: t("player.menu.speed"),
        icon: "speed",
        showSelection: false,
        options: speedOptions,
      });
    }

    if (!isOffline) {
      groups.push({
        title: t("player.menu.quality"),
        icon: "tune",
        showSelection: false,
        options: BITRATES.map((bitrate) => ({
          type: "radio" as const,
          label: bitrate.key,
          value: bitrate.value?.toString() ?? "",
          selected: bitrateValue === (bitrate.value?.toString() ?? ""),
          onPress: () => changeBitrate(bitrate.value?.toString() ?? ""),
        })),
      });
    }

    if (chapters && chapters.length > 0) {
      groups.push({
        title: t("chapters.title"),
        icon: "bookmark-border",
        showSelection: false,
        // Plain jump entries like the iPhone's (no checkmark).
        options: chapters.map((chapter, index) => {
          const startMs = ticksToMs(chapter.StartPositionTicks ?? 0);
          return {
            type: "radio" as const,
            label: `${chapter.Name || `${index + 1}`} — ${formatPlayerTime(startMs / 1000)}`,
            value: `${index}`,
            selected: false,
            onPress: () => seekTo(startMs),
          };
        }),
      });
    }

    groups.push({
      title: t("player.sleep_timer"),
      icon: "bedtime",
      showSelection: false,
      options: [
        ...(sleepTimerMinutes !== null
          ? [
              {
                type: "radio" as const,
                label: t("player.sleep_timer_off"),
                value: "off",
                selected: false,
                onPress: cancelSleepTimer,
              },
            ]
          : []),
        ...SLEEP_TIMER_PRESET_MINUTES.map((minutes) => ({
          type: "radio" as const,
          label: sleepTimerLabel(minutes),
          value: `${minutes}`,
          selected: sleepTimerMinutes === minutes,
          onPress: () => setSleepTimer(minutes),
        })),
      ],
    });

    const rotate: IconAction = {
      type: "action",
      label: t("player.rotate"),
      icon: "rotate-90-degrees-cw",
      onPress: onRotate,
    };
    const lock: IconAction = {
      type: "action",
      label: t("player.lock_controls"),
      icon: "lock-outline",
      onPress: onLockControls,
    };
    groups.push({ options: [rotate, lock] });

    if (onToggleTechnicalInfo) {
      const info: IconAction = {
        type: "action",
        label: t("player.menu.show_technical_info"),
        icon: showTechnicalInfo ? "check" : "info-outline",
        onPress: onToggleTechnicalInfo,
      };
      groups.push({ options: [info] });
    }

    return groups;
  }, [
    t,
    compact,
    isZoomedToFill,
    onZoomToggle,
    speedOptions,
    isOffline,
    bitrateValue,
    changeBitrate,
    chapterKey,
    seekTo,
    sleepTimerMinutes,
    setSleepTimer,
    cancelSleepTimer,
    onRotate,
    onLockControls,
    showTechnicalInfo,
    onToggleTechnicalInfo,
  ]);

  return { audio, subtitles, speed, more };
};
