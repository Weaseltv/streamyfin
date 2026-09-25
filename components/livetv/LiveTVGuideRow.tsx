import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { memo, useMemo } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { NeonBoard } from "@/constants/Colors";
import { glowRule, rgba, Sizes } from "@/constants/neon";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { GUIDE_HOUR_WIDTH } from "./HourHeader";

export const GUIDE_ROW_HEIGHT = 64;

const timeRange = (s?: string | null, e?: string | null) => {
  if (!s || !e) return "";
  const f = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${f(new Date(s))} – ${f(new Date(e))}`;
};

type PositionedProgram = BaseItemDto & {
  position: number;
  width: number;
  /** Precomputed once per programme, not on every render. */
  timeLabel: string;
  startMs: number;
  endMs: number;
};

/**
 * One programme cell. Its label is pinned to the left edge of the viewport
 * while the cell is partly scrolled off, driven by the scroll offset on the
 * UI thread: scrolling the guide no longer re-renders any React row.
 */
const GuideCell = memo(
  ({
    program: p,
    live,
    scrollX,
  }: {
    program: PositionedProgram;
    live: boolean;
    scrollX?: SharedValue<number>;
  }) => {
    const labelStyle = useAnimatedStyle(() => {
      const x = scrollX?.value ?? 0;
      const shift = x > p.position ? x - p.position : 0;
      // Stop pinning once the label would run out of its own cell.
      return {
        transform: [{ translateX: Math.min(shift, Math.max(p.width - 40, 0)) }],
      };
    }, [p.position, p.width]);

    return (
      <TouchableItemRouter item={p}>
        <View
          style={{
            width: p.width,
            height: "100%",
            position: "absolute",
            left: p.position,
            backgroundColor: live ? rgba(NeonBoard.cyan, 0.09) : "transparent",
            borderLeftWidth: 1,
            borderLeftColor: NeonBoard.line,
            overflow: "hidden",
            justifyContent: "center",
          }}
        >
          {live ? (
            <View
              style={[
                {
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: Sizes.tally,
                  backgroundColor: NeonBoard.cyan,
                },
                glowRule(NeonBoard.cyan),
              ]}
            />
          ) : null}
          <Animated.View style={[{ paddingHorizontal: 10 }, labelStyle]}>
            <Text variant='cardTitle' numberOfLines={1}>
              {p.Name}
            </Text>
            <Text
              variant='caption'
              numberOfLines={1}
              style={{
                color: live ? NeonBoard.cyan : NeonBoard.mid,
                marginTop: 2,
              }}
            >
              {p.timeLabel}
            </Text>
          </Animated.View>
        </View>
      </TouchableItemRouter>
    );
  },
);

/**
 * One channel row: programme cells laid out by absolute time from the grid
 * start (216 per hour), 1pt `line` left border, title 13/600, time 11 `mid`;
 * the current programme fills cyan at 0.09 with a 3pt cyan tally.
 *
 * `scrollX` is a Reanimated shared value. It used to be React state updated
 * about every 32 ms during a horizontal scroll and passed to every row, so
 * each scroll step re-rendered every row and re-formatted every programme's
 * times on the JS thread. `now` is minute-granular and owned by the page.
 */
export const LiveTVGuideRow = ({
  channel,
  programs,
  gridStart,
  scrollX,
  now,
  isVisible = true,
}: {
  channel: BaseItemDto;
  programs?: BaseItemDto[] | null;
  gridStart: Date;
  scrollX?: SharedValue<number>;
  now?: Date;
  isVisible?: boolean;
}) => {
  const programsWithPositions = useMemo<PositionedProgram[]>(() => {
    const start0 = gridStart.getTime();
    return (programs ?? [])
      .filter((p) => p.ChannelId === channel.Id && p.StartDate && p.EndDate)
      .map((p) => {
        const startMs = new Date(p.StartDate!).getTime();
        const endMs = new Date(p.EndDate!).getTime();
        const s = Math.max(startMs, start0);
        const position = ((s - start0) / 3600000) * GUIDE_HOUR_WIDTH;
        const width = Math.max(((endMs - s) / 3600000) * GUIDE_HOUR_WIDTH, 0);
        return {
          ...p,
          width,
          position,
          startMs,
          endMs,
          timeLabel: timeRange(p.StartDate, p.EndDate),
        };
      })
      .filter((p) => p.width > 0);
  }, [programs, channel.Id, gridStart]);

  if (!isVisible) {
    return <View style={{ height: GUIDE_ROW_HEIGHT }} />;
  }

  const nowMs = (now ?? new Date()).getTime();
  return (
    <View
      key={channel.ChannelNumber}
      style={{
        height: GUIDE_ROW_HEIGHT,
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      {programsWithPositions.map((p) => (
        <GuideCell
          key={p.Id}
          program={p}
          live={nowMs >= p.startMs && nowMs <= p.endMs}
          scrollX={scrollX}
        />
      ))}
    </View>
  );
};
