import { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useKeyEventListener } from "expo-key-event";
import { useLocalSearchParams } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import {
  type ComponentProps,
  type FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import ContinueWatchingOverlay from "@/components/video-player/controls/ContinueWatchingOverlay";
import { typeAccent } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useCreditSkipper } from "@/hooks/useCreditSkipper";
import { useHaptic } from "@/hooks/useHaptic";
import { useIntroSkipper } from "@/hooks/useIntroSkipper";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useTrickplay } from "@/hooks/useTrickplay";
import type { TechnicalInfo } from "@/modules/mpv-player";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSetPlayerAccent } from "@/utils/atoms/pageAccent";
import { autoPlayEpisodeCountAtom, useSettings } from "@/utils/atoms/settings";
import { hasChapterMarkers } from "@/utils/chapters";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { msToTicks, ticksToMs } from "@/utils/time";
import { AndroidBottomBar } from "./android/AndroidBottomBar";
import { AndroidPlayerChrome } from "./android/AndroidPlayerChrome";
import { IOS_PLAYER, isAndroidPhone } from "./android/layout";
import { useAndroidPlayerMenus } from "./android/useAndroidPlayerMenus";
import { useRotatePlayer } from "./android/useRotatePlayer";
import { BottomControls } from "./BottomControls";
import { CenterControls } from "./CenterControls";
import { CONTROLS_CONSTANTS } from "./constants";
import { useVideoContext } from "./contexts/VideoContext";
import { EpisodeList } from "./EpisodeList";
import { GestureOverlay } from "./GestureOverlay";
import { HeaderControls } from "./HeaderControls";
import { useChapterNavigation } from "./hooks/useChapterNavigation";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoNavigation } from "./hooks/useVideoNavigation";
import { useVideoSlider } from "./hooks/useVideoSlider";
import { useVideoTime } from "./hooks/useVideoTime";
import { SkipSegmentOverlay } from "./SkipSegmentOverlay";
import { TechnicalInfoOverlay } from "./TechnicalInfoOverlay";
import { useControlsTimeout } from "./useControlsTimeout";
import { PlaybackSpeedScope } from "./utils/playback-speed-settings";
import { type AspectRatio } from "./VideoScalingModeSelector";

interface Props {
  item: BaseItemDto;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering: boolean;
  showControls: boolean;
  enableTrickplay?: boolean;
  togglePlay: () => void;
  setShowControls: (shown: boolean) => void;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  startPictureInPicture?: () => Promise<unknown>;
  play: () => void;
  pause: () => void;
  aspectRatio?: AspectRatio;
  isZoomedToFill?: boolean;
  onZoomToggle?: () => void;
  api?: Api | null;
  downloadedFiles?: DownloadedItem[];
  // Playback speed props
  playbackSpeed?: number;
  setPlaybackSpeed?: (speed: number, scope: PlaybackSpeedScope) => void;
  onHoldSpeedStart?: () => void;
  onHoldSpeedEnd?: () => void;
  // Technical info props
  showTechnicalInfo?: boolean;
  onToggleTechnicalInfo?: () => void;
  getTechnicalInfo?: () => Promise<TechnicalInfo>;
  playMethod?: "DirectPlay" | "DirectStream" | "Transcode";
  transcodeReasons?: string[];
}

const CONTROLS_ANIMATION_CONFIG = {
  duration: 300,
  easing: Easing.out(Easing.quad),
};

// Shares its duration with the scrim dim in GestureOverlay so both halves
// of the speed boost dim together
const HOLD_SPEED_DIM_CONFIG = {
  duration: CONTROLS_CONSTANTS.HOLD_SPEED_DIM_DURATION,
  easing: Easing.out(Easing.quad),
};

export const Controls: FC<Props> = ({
  item,
  seek,
  startPictureInPicture,
  play,
  pause,
  togglePlay,
  isPlaying,
  isSeeking,
  progress,
  isBuffering,
  cacheProgress,
  showControls,
  setShowControls,
  mediaSource,
  aspectRatio = "default",
  isZoomedToFill = false,
  onZoomToggle,
  api = null,
  downloadedFiles = undefined,
  playbackSpeed = 1.0,
  setPlaybackSpeed,
  onHoldSpeedStart,
  onHoldSpeedEnd,
  showTechnicalInfo = false,
  onToggleTechnicalInfo,
  getTechnicalInfo,
  playMethod,
  transcodeReasons,
}) => {
  const offline = useOfflineMode();
  const { settings } = useSettings();
  const { getUserSubtitleIndex } = useVideoContext();
  const [autoPlayEpisodeCount, setAutoPlayEpisodeCount] = useAtom(
    autoPlayEpisodeCountAtom,
  );
  useSetPlayerAccent(item ? typeAccent(item) : undefined);
  const router = useRouter();
  const lightHapticFeedback = useHaptic("light");

  const [episodeView, setEpisodeView] = useState(false);
  const [showAudioSlider, setShowAudioSlider] = useState(false);

  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const { previousItem, nextItem } = usePlaybackManager({
    item,
    isOffline: offline,
  });

  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } = useTrickplay(
    item,
    !isBuffering,
  );

  const min = useSharedValue(0);
  // Regular value for use during render (avoids Reanimated warning)
  const maxMs = ticksToMs(item.RunTimeTicks || 0);
  const max = useSharedValue(maxMs);

  // Animation values for controls
  const controlsOpacity = useSharedValue(showControls ? 1 : 0);
  const headerTranslateY = useSharedValue(showControls ? 0 : -50);
  const bottomTranslateY = useSharedValue(showControls ? 0 : 50);

  // Animate controls visibility
  useEffect(() => {
    // The Android phone chrome fades itself (FadeView, the iPhone's 0.2 s).
    if (isAndroidPhone) return;
    controlsOpacity.value = withTiming(
      showControls ? 1 : 0,
      CONTROLS_ANIMATION_CONFIG,
    );
    headerTranslateY.value = withTiming(
      showControls ? 0 : -10,
      CONTROLS_ANIMATION_CONFIG,
    );
    bottomTranslateY.value = withTiming(
      showControls ? 0 : 10,
      CONTROLS_ANIMATION_CONFIG,
    );
  }, [showControls, controlsOpacity, headerTranslateY, bottomTranslateY]);

  // Dim the controls while a speed boost is held so the video stays readable
  const handleHoldSpeedStart = useCallback(() => {
    // The iPhone keeps its chrome as it is during a hold; only the pill shows.
    if (showControls && !isAndroidPhone) {
      controlsOpacity.value = withTiming(
        CONTROLS_CONSTANTS.HOLD_SPEED_DIM_OPACITY,
        HOLD_SPEED_DIM_CONFIG,
      );
    }
    onHoldSpeedStart?.();
  }, [showControls, controlsOpacity, onHoldSpeedStart]);

  const handleHoldSpeedEnd = useCallback(() => {
    if (showControls && !isAndroidPhone) {
      controlsOpacity.value = withTiming(1, HOLD_SPEED_DIM_CONFIG);
    }
    onHoldSpeedEnd?.();
  }, [showControls, controlsOpacity, onHoldSpeedEnd]);

  // Top edge of the rendered video, so overlays sit inside the frame
  // instead of in the letterbox bars
  const videoTopOffset = useMemo(() => {
    if (isZoomedToFill) return 0;
    const videoStream = mediaSource?.MediaStreams?.find(
      (s) => s.Type === "Video",
    );
    if (!videoStream?.Width || !videoStream?.Height) return 0;
    const videoAspect = videoStream.Width / videoStream.Height;
    const screenAspect = screenWidth / screenHeight;
    if (screenAspect >= videoAspect) return 0;
    return (screenHeight - screenWidth / videoAspect) / 2;
  }, [isZoomedToFill, mediaSource, screenWidth, screenHeight]);

  // Create animated styles
  const headerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  }));

  const centerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  }));

  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: bottomTranslateY.value }],
    position: "absolute" as const,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  }));

  // Initialize progress values - MPV uses milliseconds
  useEffect(() => {
    if (item) {
      progress.value = ticksToMs(item?.UserData?.PlaybackPositionTicks);
      max.value = ticksToMs(item.RunTimeTicks || 0);
    }
  }, [item, progress, max]);

  // Navigation hooks
  const {
    handleSeekBackward,
    handleSeekForward,
    handleSkipBackward,
    handleSkipForward,
  } = useVideoNavigation({
    progress,
    isPlaying,
    seek,
    play,
  });

  useKeyEventListener((e) => {
    if (episodeView || showAudioSlider) return;
    if (e?.eventType !== "press") return;
    const key = e.key;

    if (key === " " || key === "Spacebar" || key === "Space") {
      togglePlay();
    } else if (!Platform.isTV && key === "ArrowLeft") {
      // Exclude TV platforms to prevent conflicts with the remote control,
      // which uses the same arrow keys for directional UI navigation.
      handleSkipBackward();
    } else if (!Platform.isTV && key === "ArrowRight") {
      handleSkipForward();
    }
  });

  // Chapter navigation hook
  const {
    hasChapters,
    hasPreviousChapter,
    hasNextChapter,
    goToPreviousChapter,
    goToNextChapter,
  } = useChapterNavigation({
    chapters: item.Chapters,
    progress,
    maxMs,
    seek,
  });

  // Android phone lock mode (the iPhone's "Lock controls"): the chrome
  // stays hidden and taps only toggle a transient Unlock pill.
  const [controlsLocked, setControlsLocked] = useState(false);
  const [unlockRevealed, setUnlockRevealed] = useState(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealUnlockButton = useCallback(() => {
    setUnlockRevealed(true);
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(
      () => setUnlockRevealed(false),
      IOS_PLAYER.unlockRevealMs,
    );
  }, []);
  useEffect(
    () => () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    },
    [],
  );

  const toggleControls = useCallback(() => {
    if (controlsLocked) {
      if (unlockRevealed) {
        if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
        setUnlockRevealed(false);
      } else {
        revealUnlockButton();
      }
      return;
    }
    if (showControls) {
      setShowAudioSlider(false);
      setShowControls(false);
    } else {
      setShowControls(true);
    }
  }, [
    showControls,
    setShowControls,
    controlsLocked,
    unlockRevealed,
    revealUnlockButton,
  ]);

  const lockControls = useCallback(() => {
    lightHapticFeedback();
    setControlsLocked(true);
    setShowAudioSlider(false);
    setShowControls(false);
    // Brief confirmation so the lock doesn't look like a plain hide.
    revealUnlockButton();
  }, [lightHapticFeedback, setShowControls, revealUnlockButton]);

  const unlockControls = useCallback(() => {
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    setUnlockRevealed(false);
    setControlsLocked(false);
    setShowControls(true);
  }, [setShowControls]);

  // Remote control hook
  const {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    isSliding: isRemoteSliding,
    time: remoteTime,
  } = useRemoteControl({
    progress,
    min,
    max,
    showControls,
    isPlaying,
    seek,
    play,
    togglePlay,
    toggleControls,
    calculateTrickplayUrl,
    handleSeekForward,
    handleSeekBackward,
  });

  // Slider hook
  const {
    isSliding,
    time,
    handleSliderStart,
    handleTouchStart,
    handleTouchEnd,
    handleSliderComplete,
    handleSliderChange,
    seekTo,
  } = useVideoSlider({
    progress,
    isSeeking,
    isPlaying,
    seek,
    play,
    pause,
    calculateTrickplayUrl,
    showControls,
  });

  const effectiveProgress = useSharedValue(0);

  // Recompute progress whenever remote scrubbing is active or when progress significantly changes
  useAnimatedReaction(
    () => ({
      isScrubbing: isRemoteScrubbing.value,
      scrub: remoteScrubProgress.value,
      actual: progress.value,
    }),
    (current, previous) => {
      // Always update if scrubbing state changed or we're currently scrubbing
      if (
        current.isScrubbing !== previous?.isScrubbing ||
        current.isScrubbing
      ) {
        effectiveProgress.value =
          current.isScrubbing && current.scrub != null
            ? current.scrub
            : current.actual;
      } else {
        // When not scrubbing, only update if progress changed significantly (1 second)
        // MPV uses milliseconds
        const progressUnit = CONTROLS_CONSTANTS.PROGRESS_UNIT_MS;
        const progressDiff = Math.abs(current.actual - effectiveProgress.value);
        if (progressDiff >= progressUnit) {
          effectiveProgress.value = current.actual;
        }
      }
    },
    [],
  );

  const { bitrateValue, subtitleIndex, audioIndex } = useLocalSearchParams<{
    bitrateValue: string;
    audioIndex: string;
    subtitleIndex: string;
  }>();

  const goToItemCommon = useCallback(
    (item: BaseItemDto) => {
      if (!item || !settings) {
        return;
      }
      lightHapticFeedback();
      const previousIndexes = {
        subtitleIndex: subtitleIndex
          ? getUserSubtitleIndex(Number.parseInt(subtitleIndex, 10))
          : undefined,
        audioIndex: audioIndex ? Number.parseInt(audioIndex, 10) : undefined,
      };

      const {
        mediaSource: newMediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(item, settings, {
        indexes: previousIndexes,
        source: mediaSource ?? undefined,
      });

      // Use setParams instead of replace to avoid unmounting/remounting the player,
      // which would create a new MPV native view and crash with "mp_initialize already initialized".
      router.setParams({
        ...(offline && { offline: "true" }),
        itemId: item.Id ?? "",
        audioIndex: defaultAudioIndex?.toString() ?? "",
        subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
        mediaSourceId: newMediaSource?.Id ?? "",
        bitrateValue: bitrateValue?.toString(),
        playbackPosition:
          item.UserData?.PlaybackPositionTicks?.toString() ?? "",
      });
    },
    [
      settings,
      getUserSubtitleIndex,
      subtitleIndex,
      audioIndex,
      mediaSource,
      bitrateValue,
      router,
      offline,
    ],
  );

  const goToPreviousItem = useCallback(() => {
    if (!previousItem) {
      return;
    }
    goToItemCommon(previousItem);
  }, [previousItem, goToItemCommon]);

  const goToNextItem = useCallback(
    ({
      isAutoPlay,
      resetWatchCount,
    }: {
      isAutoPlay?: boolean;
      resetWatchCount?: boolean;
    }) => {
      if (!nextItem) {
        return;
      }

      if (!isAutoPlay) {
        // if we are not autoplaying, we won't update anything, we just go to the next item
        goToItemCommon(nextItem);
        if (resetWatchCount) {
          setAutoPlayEpisodeCount(0);
        }
        return;
      }

      // Skip autoplay logic if maxAutoPlayEpisodeCount is -1
      if (settings.maxAutoPlayEpisodeCount.value === -1) {
        goToItemCommon(nextItem);
        return;
      }

      // Same boundary as the countdown's willShowNextEpisode gate — the
      // countdown must never complete without actually navigating.
      if (autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value) {
        goToItemCommon(nextItem);
      }

      // Check if the autoPlayEpisodeCount is less than maxAutoPlayEpisodeCount for the autoPlay
      if (autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value) {
        // Advance the session counter without writing preferences
        setAutoPlayEpisodeCount((count) => count + 1);
      }
    },
    [
      nextItem,
      goToItemCommon,
      autoPlayEpisodeCount,
      settings.maxAutoPlayEpisodeCount.value,
      setAutoPlayEpisodeCount,
    ],
  );

  // Add a memoized handler for autoplay next episode
  const handleNextEpisodeAutoPlay = useCallback(() => {
    goToNextItem({ isAutoPlay: true });
  }, [goToNextItem]);

  // Add a memoized handler for manual next episode
  const handleNextEpisodeManual = useCallback(() => {
    goToNextItem({ isAutoPlay: false });
  }, [goToNextItem]);

  // Add a memoized handler for ContinueWatchingOverlay
  const handleContinueWatching = useCallback(
    (options: { isAutoPlay?: boolean; resetWatchCount?: boolean }) => {
      goToNextItem(options);
    },
    [goToNextItem],
  );

  const hideControls = useCallback(() => {
    setShowControls(false);
    setShowAudioSlider(false);
  }, [setShowControls]);

  const { handleControlsInteraction } = useControlsTimeout({
    showControls,
    isSliding: isSliding || isRemoteSliding,
    episodeView,
    onHideControls: hideControls,
    timeout: CONTROLS_CONSTANTS.TIMEOUT,
    disabled: true,
  });

  // Android phone auto-hide, the iPhone's rules: 4 s after the last touch
  // while playing, 15 s after a menu button, never while paused, scrubbing,
  // buffering or showing the episode list or technical info. The timer lives
  // in refs so a touch re-arms it without re-rendering the controls (the
  // menu taps that re-arm it must stay light on the JS thread).
  const canAutoHide =
    isPlaying &&
    !isSliding &&
    !isRemoteSliding &&
    !isBuffering &&
    !episodeView &&
    !showTechnicalInfo &&
    !controlsLocked;
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoHideAllowedRef = useRef(false);
  autoHideAllowedRef.current = isAndroidPhone && showControls && canAutoHide;
  const menuTouchRef = useRef(false);
  const lastTouchResetRef = useRef(0);
  const scheduleAutoHide = useCallback(
    (delay: number = IOS_PLAYER.autoHideMs) => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
      if (!autoHideAllowedRef.current) return;
      autoHideTimerRef.current = setTimeout(() => {
        autoHideTimerRef.current = null;
        if (autoHideAllowedRef.current) hideControls();
      }, delay);
    },
    [hideControls],
  );
  useEffect(() => {
    scheduleAutoHide();
  }, [showControls, canAutoHide, scheduleAutoHide]);
  useEffect(
    () => () => {
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    },
    [],
  );

  // Any touch-down on the player re-arms the timer (throttled, like the
  // iPhone's touchInteractionOccurred). A menu button's own touch handler
  // runs first and asks for the longer menu delay.
  const handleAndroidTouchStart = useCallback(() => {
    if (!isAndroidPhone) return;
    const menuTouch = menuTouchRef.current;
    menuTouchRef.current = false;
    const now = Date.now();
    if (!menuTouch && now - lastTouchResetRef.current < 500) return;
    lastTouchResetRef.current = now;
    scheduleAutoHide(
      menuTouch ? IOS_PLAYER.menuAutoHideMs : IOS_PLAYER.autoHideMs,
    );
  }, [scheduleAutoHide]);
  const handleMenuTouch = useCallback(() => {
    menuTouchRef.current = true;
  }, []);

  // Android phone sleep timer (the iPhone's): survives episode switches and
  // closes the player when it runs out, so the phone can sleep.
  const [sleepTimer, setSleepTimerState] = useState<{
    minutes: number;
    endsAt: number;
  } | null>(null);
  const setSleepTimer = useCallback(
    (minutes: number) => {
      lightHapticFeedback();
      setSleepTimerState({ minutes, endsAt: Date.now() + minutes * 60_000 });
    },
    [lightHapticFeedback],
  );
  const cancelSleepTimer = useCallback(() => {
    lightHapticFeedback();
    setSleepTimerState(null);
  }, [lightHapticFeedback]);
  useEffect(() => {
    if (!sleepTimer) return;
    const id = setInterval(() => {
      if (Date.now() >= sleepTimer.endsAt) {
        clearInterval(id);
        setSleepTimerState(null);
        router.back();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [sleepTimer, router]);

  // Edge pills shown on their own: volume on hardware presses or a swipe,
  // brightness on a swipe (the iPhone's transient reveal, 1 s).
  const [volumeRevealed, setVolumeRevealed] = useState(false);
  const [brightnessRevealed, setBrightnessRevealed] = useState(false);
  const volumeRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightnessRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const revealVolume = useCallback(() => {
    setVolumeRevealed(true);
    if (volumeRevealTimer.current) clearTimeout(volumeRevealTimer.current);
    volumeRevealTimer.current = setTimeout(
      () => setVolumeRevealed(false),
      1000,
    );
  }, []);
  const revealBrightness = useCallback(() => {
    setBrightnessRevealed(true);
    if (brightnessRevealTimer.current)
      clearTimeout(brightnessRevealTimer.current);
    brightnessRevealTimer.current = setTimeout(
      () => setBrightnessRevealed(false),
      1000,
    );
  }, []);
  useEffect(
    () => () => {
      if (volumeRevealTimer.current) clearTimeout(volumeRevealTimer.current);
      if (brightnessRevealTimer.current)
        clearTimeout(brightnessRevealTimer.current);
    },
    [],
  );
  // Dragging a pill counts as a menu interaction on the iPhone.
  const handleSliderEditing = useCallback(
    (editing: boolean) => {
      scheduleAutoHide(
        editing ? IOS_PLAYER.menuAutoHideMs : IOS_PLAYER.autoHideMs,
      );
    },
    [scheduleAutoHide],
  );

  const rotatePlayer = useRotatePlayer();
  const closePlayer = useCallback(() => {
    lightHapticFeedback();
    router.back();
  }, [lightHapticFeedback, router]);

  const androidMenus = useAndroidPlayerMenus({
    compact: screenWidth < IOS_PLAYER.compactWidth,
    isZoomedToFill,
    onZoomToggle,
    playbackSpeed,
    setPlaybackSpeed,
    showTechnicalInfo,
    onToggleTechnicalInfo,
    chapters: item.Chapters,
    seekTo,
    getPositionTicks: () => msToTicks(progress.get()),
    sleepTimerMinutes: sleepTimer?.minutes ?? null,
    setSleepTimer,
    cancelSleepTimer,
    onRotate: rotatePlayer,
    onLockControls: lockControls,
  });

  const switchOnEpisodeMode = useCallback(() => {
    setEpisodeView(true);
    if (isPlaying) {
      togglePlay();
    }
  }, [isPlaying, togglePlay]);

  return (
    <View
      style={styles.controlsContainer}
      pointerEvents='box-none'
      onTouchStart={isAndroidPhone ? handleAndroidTouchStart : undefined}
    >
      {episodeView ? (
        <EpisodeList
          item={item}
          close={() => setEpisodeView(false)}
          goToItem={goToItemCommon}
        />
      ) : (
        <>
          <GestureOverlay
            screenWidth={screenWidth}
            screenHeight={screenHeight}
            showControls={showControls}
            onToggleControls={toggleControls}
            onSkipForward={handleSkipForward}
            onSkipBackward={handleSkipBackward}
            onHoldSpeedStart={handleHoldSpeedStart}
            onHoldSpeedEnd={handleHoldSpeedEnd}
            isPlaying={isPlaying}
            videoTopOffset={videoTopOffset}
            isZoomedToFill={isZoomedToFill}
            onZoomToggle={onZoomToggle}
            locked={controlsLocked}
            onBrightnessSwipe={revealBrightness}
          />
          {/* Technical Info Overlay - rendered outside animated views to stay visible */}
          {getTechnicalInfo && (
            <TechnicalInfoOverlay
              showControls={showControls}
              visible={showTechnicalInfo}
              getTechnicalInfo={getTechnicalInfo}
              playMethod={playMethod}
              transcodeReasons={transcodeReasons}
              mediaSource={mediaSource}
              item={item}
            />
          )}
          {isAndroidPhone ? (
            <AndroidPlayerChrome
              item={item}
              showControls={showControls && !controlsLocked}
              menus={androidMenus}
              showTrackMenus={!offline || !mediaSource?.TranscodingUrl}
              onClose={closePlayer}
              startPictureInPicture={startPictureInPicture}
              isZoomedToFill={isZoomedToFill}
              onZoomToggle={onZoomToggle}
              onShowEpisodes={
                item.Type === "Episode" ? switchOnEpisodeMode : undefined
              }
              onMenuTouch={handleMenuTouch}
              center={{
                isPlaying,
                isBuffering,
                isEpisode: item.Type === "Episode",
                rewindSeconds: settings.rewindSkipTime,
                forwardSeconds: settings.forwardSkipTime,
                togglePlay,
                onSeekBackward: handleSkipBackward,
                onSeekForward: handleSkipForward,
                hasChapters,
                hasPreviousChapter,
                hasNextChapter,
                goToPreviousChapter,
                goToNextChapter,
                hasPreviousEpisode: !!previousItem,
                hasNextEpisode: !!nextItem,
                goToPreviousEpisode: goToPreviousItem,
                goToNextEpisode: handleNextEpisodeManual,
              }}
              bottomBar={
                <TimedAndroidBottomBar
                  chapters={item.Chapters}
                  durationMs={maxMs}
                  showControls={showControls}
                  playbackSpeed={playbackSpeed}
                  sleepTimerEndsAt={sleepTimer?.endsAt ?? null}
                  isSliding={isSliding}
                  showRemoteBubble={showRemoteBubble}
                  progress={progress}
                  isSeeking={isSeeking}
                  min={min}
                  max={max}
                  effectiveProgress={effectiveProgress}
                  cacheProgress={cacheProgress}
                  handleSliderStart={handleSliderStart}
                  handleSliderComplete={handleSliderComplete}
                  handleSliderChange={handleSliderChange}
                  handleTouchStart={handleTouchStart}
                  handleTouchEnd={handleTouchEnd}
                  trickPlayUrl={trickPlayUrl}
                  trickplayInfo={trickplayInfo}
                  time={isSliding || showRemoteBubble ? time : remoteTime}
                />
              }
              isBuffering={isBuffering}
              isSliding={isSliding}
              showVolumeSlider={!settings.hideVolumeSlider}
              showBrightnessSlider={!settings.hideBrightnessSlider}
              volumeRevealed={volumeRevealed}
              brightnessRevealed={brightnessRevealed}
              onVolumeExternalChange={revealVolume}
              onSliderEditing={handleSliderEditing}
              locked={controlsLocked}
              unlockRevealed={unlockRevealed}
              onUnlock={unlockControls}
            />
          ) : (
            <>
              <Animated.View
                style={headerAnimatedStyle}
                pointerEvents={showControls ? "auto" : "none"}
              >
                <HeaderControls
                  item={item}
                  showControls={showControls}
                  offline={offline}
                  mediaSource={mediaSource}
                  startPictureInPicture={startPictureInPicture}
                  switchOnEpisodeMode={switchOnEpisodeMode}
                  goToPreviousItem={goToPreviousItem}
                  goToNextItem={goToNextItem}
                  previousItem={previousItem}
                  nextItem={nextItem}
                  aspectRatio={aspectRatio}
                  isZoomedToFill={isZoomedToFill}
                  onZoomToggle={onZoomToggle}
                  playbackSpeed={playbackSpeed}
                  setPlaybackSpeed={setPlaybackSpeed}
                  showTechnicalInfo={showTechnicalInfo}
                  onToggleTechnicalInfo={onToggleTechnicalInfo}
                />
              </Animated.View>
              <Animated.View
                style={centerAnimatedStyle}
                pointerEvents={showControls ? "box-none" : "none"}
              >
                <CenterControls
                  showControls={showControls}
                  isPlaying={isPlaying}
                  isBuffering={isBuffering}
                  showAudioSlider={showAudioSlider}
                  setShowAudioSlider={setShowAudioSlider}
                  togglePlay={togglePlay}
                  handleSkipBackward={handleSkipBackward}
                  handleSkipForward={handleSkipForward}
                  hasChapters={hasChapters}
                  hasPreviousChapter={hasPreviousChapter}
                  hasNextChapter={hasNextChapter}
                  goToPreviousChapter={goToPreviousChapter}
                  goToNextChapter={goToNextChapter}
                />
              </Animated.View>
              <Animated.View
                style={bottomAnimatedStyle}
                pointerEvents={showControls ? "auto" : "none"}
              >
                <TimedBottomControls
                  item={item}
                  chapters={item.Chapters}
                  durationMs={maxMs}
                  showControls={showControls}
                  isSliding={isSliding}
                  showRemoteBubble={showRemoteBubble}
                  progress={progress}
                  isSeeking={isSeeking}
                  handleControlsInteraction={handleControlsInteraction}
                  min={min}
                  max={max}
                  effectiveProgress={effectiveProgress}
                  cacheProgress={cacheProgress}
                  handleSliderStart={handleSliderStart}
                  handleSliderComplete={handleSliderComplete}
                  handleSliderChange={handleSliderChange}
                  handleTouchStart={handleTouchStart}
                  handleTouchEnd={handleTouchEnd}
                  seekTo={seekTo}
                  trickPlayUrl={trickPlayUrl}
                  trickplayInfo={trickplayInfo}
                  time={isSliding || showRemoteBubble ? time : remoteTime}
                />
              </Animated.View>
            </>
          )}
        </>
      )}
      <PlaybackTimingOverlays
        item={item}
        progress={progress}
        max={max}
        isSeeking={isSeeking}
        maxMs={maxMs}
        seek={seek}
        play={play}
        pause={pause}
        api={api}
        downloadedFiles={downloadedFiles}
        offline={offline}
        nextItem={nextItem}
        showControls={showControls}
        episodeView={episodeView}
        onAutoPlay={handleNextEpisodeAutoPlay}
        onNextPress={handleNextEpisodeManual}
        onContinue={handleContinueWatching}
        controlsLocked={controlsLocked}
      />
    </View>
  );
};

type TimedAndroidBottomProps = Omit<
  ComponentProps<typeof AndroidBottomBar>,
  "currentTime" | "remainingTime"
> & {
  progress: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
  showControls: boolean;
};
function TimedAndroidBottomBar({
  progress,
  isSeeking,
  showControls,
  ...props
}: TimedAndroidBottomProps) {
  const times = useVideoTime({
    progress,
    max: props.max,
    isSeeking,
    active: showControls,
  });
  return <AndroidBottomBar {...props} {...times} />;
}

type TimedBottomProps = Omit<
  ComponentProps<typeof BottomControls>,
  "currentTime" | "remainingTime"
> & {
  progress: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
};
function TimedBottomControls({
  progress,
  isSeeking,
  ...props
}: TimedBottomProps) {
  const times = useVideoTime({
    progress,
    max: props.max,
    isSeeking,
    active: props.showControls,
  });
  return <BottomControls {...props} {...times} />;
}

type TimingProps = Pick<
  Props,
  | "item"
  | "progress"
  | "isSeeking"
  | "seek"
  | "play"
  | "pause"
  | "api"
  | "downloadedFiles"
  | "showControls"
> & {
  max: SharedValue<number>;
  maxMs: number;
  offline: boolean;
  nextItem?: BaseItemDto | null;
  episodeView: boolean;
  /** Android phone lock mode hides the skip and countdown buttons. */
  controlsLocked: boolean;
  onAutoPlay: () => void;
  onNextPress: () => void;
  onContinue: (options: {
    isAutoPlay?: boolean;
    resetWatchCount?: boolean;
  }) => void;
};
function PlaybackTimingOverlays({
  item,
  progress,
  max,
  isSeeking,
  maxMs,
  seek,
  play,
  pause,
  api,
  downloadedFiles,
  offline,
  nextItem,
  showControls,
  episodeView,
  controlsLocked,
  onAutoPlay,
  onNextPress,
  onContinue,
}: TimingProps) {
  const { settings } = useSettings();
  const autoPlayEpisodeCount = useAtomValue(autoPlayEpisodeCountAtom);
  // This clock keeps skip/autoplay/EOF behavior live even with controls hidden.
  const { currentTime, remainingTime } = useVideoTime({
    progress,
    max,
    isSeeking,
  });
  const { showSkipButton, skipIntro } = useIntroSkipper(
    item.Id!,
    currentTime,
    seek,
    play,
    offline,
    api,
    downloadedFiles,
  );

  const { showSkipCreditButton, skipCredit, hasContentAfterCredits } =
    useCreditSkipper(
      item.Id!,
      currentTime,
      seek,
      play,
      offline,
      api,
      downloadedFiles,
      maxMs,
    );

  // Same gate as the bookmark icon in BottomControls, so the skip overlay
  // only shifts left when the icon is actually shown.
  const showsChapterIcon = useMemo(
    () => hasChapterMarkers(item.Chapters, maxMs),
    [item.Chapters, maxMs],
  );

  // Whether the "Next Episode" countdown can be rendered at all. The Skip
  // Credits button yields to it only when this is true; if autoplay is
  // disabled or its episode limit is reached, Skip Credits must stay available.
  const willShowNextEpisode =
    !!nextItem &&
    settings.autoPlayNextEpisode !== false &&
    (settings.maxAutoPlayEpisodeCount.value === -1 ||
      autoPlayEpisodeCount < settings.maxAutoPlayEpisodeCount.value);

  // Show during credits when nothing plays after them, or in the last seconds.
  const showNextEpisode =
    willShowNextEpisode &&
    ((showSkipCreditButton && !hasContentAfterCredits) ||
      remainingTime < 10000);

  // Autoplay would run at EOF but the episode cap stops it: ask "Still
  // watching?" there instead, with playback paused — mirroring the native
  // player's stillWatchingRequired flow. Gated on reaching the end so the
  // prompt never covers a video that is still playing.
  const stillWatchingRequired =
    !!nextItem &&
    settings.autoPlayNextEpisode !== false &&
    settings.maxAutoPlayEpisodeCount.value !== -1 &&
    autoPlayEpisodeCount >= settings.maxAutoPlayEpisodeCount.value;

  const [stillWatchingVisible, setStillWatchingVisible] = useState(false);
  // The cap-hitting autoplay updates the episode count synchronously while
  // currentTime/remainingTime still hold the outgoing episode's near-zero
  // values (the next item loads async), so "at EOF" alone would fire the
  // prompt over the incoming episode. Only a progress tick from mid-playback
  // of the final episode itself arms the trigger.
  const stillWatchingArmedRef = useRef(false);

  // Reset after an in-place episode switch (setParams keeps Controls mounted).
  useEffect(() => {
    stillWatchingArmedRef.current = false;
    setStillWatchingVisible(false);
  }, [item.Id]);

  useEffect(() => {
    if (!stillWatchingRequired || stillWatchingVisible || maxMs <= 0) {
      return;
    }
    if (
      currentTime > 0 &&
      remainingTime > CONTROLS_CONSTANTS.STILL_WATCHING_EOF_WINDOW_MS
    ) {
      stillWatchingArmedRef.current = true;
      return;
    }
    if (
      stillWatchingArmedRef.current &&
      remainingTime <= CONTROLS_CONSTANTS.STILL_WATCHING_EOF_WINDOW_MS
    ) {
      setStillWatchingVisible(true);
      pause();
    }
  }, [
    stillWatchingVisible,
    stillWatchingRequired,
    maxMs,
    currentTime,
    remainingTime,
    pause,
  ]);

  return (
    <>
      {!episodeView && (
        // Lock mode hides the buttons but keeps them mounted, so an armed
        // next-episode countdown still advances (as on the iPhone).
        <View
          style={[StyleSheet.absoluteFill, controlsLocked && { opacity: 0 }]}
          pointerEvents={controlsLocked ? "none" : "box-none"}
        >
          <SkipSegmentOverlay
            showSkipButton={showSkipButton}
            showSkipCreditButton={showSkipCreditButton}
            hasContentAfterCredits={hasContentAfterCredits}
            willShowNextEpisode={willShowNextEpisode}
            showNextEpisode={showNextEpisode}
            skipIntro={skipIntro}
            skipCredit={skipCredit}
            onNextEpisodeFinish={onAutoPlay}
            onNextEpisodePress={onNextPress}
            controlsVisible={showControls}
            hasChapters={showsChapterIcon}
          />
        </View>
      )}
      {stillWatchingVisible && (
        <ContinueWatchingOverlay goToNextItem={onContinue} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  controlsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
