import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client";
import { type FC, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import Animated, { type SharedValue } from "react-native-reanimated";
import { ChapterTicks } from "@/components/chapters/ChapterTicks";
import { formatClockTime, formatPlayerTime } from "@/utils/androidPlayerChrome";
import {
  chapterMarkers,
  chapterNameAt,
  hasChapterMarkers,
} from "@/utils/chapters";
import { TrickplayBubble } from "../TrickplayBubble";
import { IOS_PLAYER } from "./layout";

interface Props {
  chapters?: ChapterInfo[] | null;
  durationMs: number;
  /** Elapsed / remaining playback in milliseconds. */
  currentTime: number;
  remainingTime: number;
  playbackSpeed: number;
  /** Wall-clock end of the sleep timer, when one is set. */
  sleepTimerEndsAt: number | null;
  isSliding: boolean;
  showRemoteBubble: boolean;
  min: SharedValue<number>;
  max: SharedValue<number>;
  effectiveProgress: SharedValue<number>;
  cacheProgress: SharedValue<number>;
  handleSliderStart: () => void;
  handleSliderComplete: (value: number) => void;
  handleSliderChange: (value: number) => void;
  handleTouchStart: () => void;
  handleTouchEnd: () => void;
  trickPlayUrl: { x: number; y: number; url: string } | null;
  trickplayInfo: {
    aspectRatio?: number;
    data: { TileWidth?: number; TileHeight?: number };
  } | null;
  time: { hours: number; minutes: number; seconds: number };
}

const TIME_STYLE = {
  color: "rgba(255,255,255,0.85)",
  fontSize: 13,
  lineHeight: 16,
  fontVariant: ["tabular-nums" as const],
};

const SMALL_STYLE = {
  color: "rgba(255,255,255,0.55)",
  fontSize: 10,
  lineHeight: 12,
  fontVariant: ["tabular-nums" as const],
};

/**
 * The iPhone player's bottom bar (PlayerBottomBar + ScrubberView): the
 * current chapter, a white capsule scrubber with a 44 pt touch frame, then
 * elapsed time on the left and remaining time, "Ends at" and the sleep timer
 * on the right.
 */
export const AndroidBottomBar: FC<Props> = ({
  chapters,
  durationMs,
  currentTime,
  remainingTime,
  playbackSpeed,
  sleepTimerEndsAt,
  isSliding,
  showRemoteBubble,
  min,
  max,
  effectiveProgress,
  cacheProgress,
  handleSliderStart,
  handleSliderComplete,
  handleSliderChange,
  handleTouchStart,
  handleTouchEnd,
  trickPlayUrl,
  trickplayInfo,
  time,
}) => {
  const { t } = useTranslation();
  const trackHeight = isSliding
    ? IOS_PLAYER.trackHeightScrubbing
    : IOS_PLAYER.trackHeight;

  const markers = useMemo(
    () => chapterMarkers(chapters, durationMs),
    [chapters, durationMs],
  );
  const hasChapters = useMemo(
    () => hasChapterMarkers(chapters, durationMs),
    [chapters, durationMs],
  );
  const currentChapterName = hasChapters
    ? chapterNameAt(currentTime, chapters)
    : null;
  const scrubChapterName = useMemo(() => {
    if (!hasChapters) return null;
    const scrubMs =
      (time.hours * 3600 + time.minutes * 60 + time.seconds) * 1000;
    return chapterNameAt(scrubMs, chapters);
  }, [hasChapters, time.hours, time.minutes, time.seconds, chapters]);

  // iOS divides the remaining media time by the rate: 10 minutes at 2×
  // ends in 5.
  const endsAt =
    durationMs > 0 && Number.isFinite(remainingTime)
      ? t("player.ends_at", {
          time: formatClockTime(
            new Date(
              Date.now() + remainingTime / Math.max(playbackSpeed, 0.01),
            ),
          ),
        })
      : null;

  return (
    <View pointerEvents='box-none' style={{ gap: IOS_PLAYER.bottomBarSpacing }}>
      {currentChapterName ? (
        <Text
          pointerEvents='none'
          numberOfLines={1}
          allowFontScaling={false}
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 12,
            lineHeight: 16,
          }}
        >
          {currentChapterName}
        </Text>
      ) : null}

      <View
        style={{ height: IOS_PLAYER.scrubberFrame, justifyContent: "center" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Slider
          // The whole 44 pt frame drags, like ScrubberView; the track draws
          // centred inside it.
          style={{ height: IOS_PLAYER.scrubberFrame }}
          theme={{
            maximumTrackTintColor: "rgba(255,255,255,0.25)",
            minimumTrackTintColor: "white",
            cacheTrackTintColor: "rgba(255,255,255,0.4)",
            bubbleBackgroundColor: "transparent",
            bubbleTextColor: "white",
          }}
          renderThumb={() => null}
          thumbWidth={0}
          sliderHeight={trackHeight}
          renderContainer={({ style, seekStyle, cacheXStyle }) => (
            <View
              style={[
                style,
                {
                  height: trackHeight,
                  borderRadius: trackHeight / 2,
                  backgroundColor: "rgba(255,255,255,0.25)",
                  overflow: "hidden",
                },
              ]}
            >
              <Animated.View
                style={[
                  cacheXStyle,
                  {
                    position: "absolute",
                    height: "100%",
                    minWidth: trackHeight,
                    borderRadius: trackHeight / 2,
                    backgroundColor: "rgba(255,255,255,0.4)",
                  },
                ]}
              />
              <Animated.View
                style={[
                  seekStyle,
                  {
                    position: "absolute",
                    height: "100%",
                    minWidth: trackHeight,
                    borderRadius: trackHeight / 2,
                    backgroundColor: "white",
                  },
                ]}
              />
            </View>
          )}
          cache={cacheProgress}
          onSlidingStart={handleSliderStart}
          onSlidingComplete={handleSliderComplete}
          onValueChange={handleSliderChange}
          containerStyle={{ borderRadius: trackHeight / 2 }}
          renderBubble={() =>
            (isSliding || showRemoteBubble) && (
              <TrickplayBubble
                trickPlayUrl={trickPlayUrl}
                trickplayInfo={trickplayInfo}
                time={time}
                chapterName={scrubChapterName}
              />
            )
          }
          progress={effectiveProgress}
          minimumValue={min}
          maximumValue={max}
        />
        <View
          pointerEvents='none'
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: (IOS_PLAYER.scrubberFrame - trackHeight) / 2,
            height: trackHeight,
          }}
        >
          <ChapterTicks
            markers={markers}
            height={trackHeight - 2}
            color='rgba(0,0,0,0.55)'
          />
        </View>
      </View>

      <View
        pointerEvents='none'
        style={{ flexDirection: "row", alignItems: "flex-start" }}
      >
        <Text allowFontScaling={false} style={TIME_STYLE}>
          {formatPlayerTime(currentTime / 1000)}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: "flex-end", gap: 1 }}>
          <Text allowFontScaling={false} style={TIME_STYLE}>
            -{formatPlayerTime(Math.max(0, remainingTime) / 1000)}
          </Text>
          {endsAt ? (
            <Text allowFontScaling={false} style={SMALL_STYLE}>
              {endsAt}
            </Text>
          ) : null}
          {sleepTimerEndsAt !== null && (
            <SleepTimerCountdown endsAt={sleepTimerEndsAt} />
          )}
        </View>
      </View>
    </View>
  );
};

/** Ticks on its own clock so it keeps moving while playback is paused. */
const SleepTimerCountdown: FC<{ endsAt: number }> = ({ endsAt }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
      <MaterialCommunityIcons
        name='sleep'
        size={11}
        color='rgba(255,255,255,0.55)'
      />
      <Text allowFontScaling={false} style={SMALL_STYLE}>
        {formatPlayerTime(Math.max(0, endsAt - now) / 1000)}
      </Text>
    </View>
  );
};
