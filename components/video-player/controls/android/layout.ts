import { Platform } from "react-native";

/**
 * Android phones draw the player chrome in the iPhone's layout (owner's
 * decision Q3, round 2): the numbers below are copied 1:1 from WeaselPlex's
 * own iOS player (modules/mpv-player/ios/NativePlayer/Views). After the Q1
 * scaling an Android dp equals an iOS point, so no conversion is needed.
 * iOS (its MPV-mode controls) and TV keep their own chrome.
 */
export const isAndroidPhone = Platform.OS === "android" && !Platform.isTV;

export const IOS_PLAYER = {
  /** PlayerControlsRootView.controls: .padding(.horizontal, 24). */
  edgePadding: 24,
  /** PlayerControlsRootView.controls: .padding(.vertical, 8). */
  verticalPadding: 8,
  /** PlayerTopBar HStack spacing. */
  barSpacing: 4,
  /** PlayerTopBar buttonSize: 40 when compact, 44 otherwise. */
  barButtonCompact: 40,
  barButtonRegular: 44,
  /** PlayerTopBar icons are 17 pt semibold SF Symbols; Material glyphs sit
   * inside a padded box, so 22 dp draws them at the same visual size. */
  barIconSize: 22,
  /** Below this width the top bar folds zoom + speed into the More menu. */
  compactWidth: 500,
  /** PlayerBottomBar: .padding(.bottom, 8) inside the 8 pt vertical padding. */
  bottomBarPadding: 8,
  /** PlayerBottomBar VStack spacing. */
  bottomBarSpacing: 6,
  /** ScrubberView: 44 pt touch frame, 7 pt track (11 pt while scrubbing). */
  scrubberFrame: 44,
  trackHeight: 7,
  trackHeightScrubbing: 11,
  /** Edge sliders: 20 pt inset, 34 pt pill, 130 pt track, 6 pt line. */
  sliderInset: 20,
  sliderPillWidth: 34,
  sliderTrackHeight: 130,
  sliderLineWidth: 6,
  /** Center row horizontal padding with / without the edge sliders. */
  centerPaddingWithSliders: 62,
  centerPaddingNoSliders: 24,
  /** PlayerViewModel.autoHideDelay / menuAutoHideDelay. */
  autoHideMs: 4000,
  menuAutoHideMs: 15000,
  /** .animation(.easeInOut(duration: 0.2), value: controlsVisible). */
  fadeMs: 200,
  /** revealUnlockButton: 2.5 s. */
  unlockRevealMs: 2500,
  /** doubleTapSeek feedback: 0.8 s, faded in/out over 0.15 s. */
  doubleTapFeedbackMs: 800,
  doubleTapFadeMs: 150,
  /** Scrims: 140 pt top, 160 pt bottom, black 0.6 → 0. */
  topScrimHeight: 140,
  bottomScrimHeight: 160,
  scrimOpacity: 0.6,
  /** pinchChanged: one zoom flip per pinch past these scales. */
  pinchZoomIn: 1.12,
  pinchZoomOut: 0.88,
  /** Skip pill / countdown: trailing 24, bottom 124 with controls, 32 without. */
  skipTrailing: 24,
  skipBottomVisible: 124,
  skipBottomHidden: 32,
} as const;
