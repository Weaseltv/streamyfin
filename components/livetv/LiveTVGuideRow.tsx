import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { View } from "react-native";
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

/**
 * One channel row: programme cells laid out by absolute time from the grid
 * start (216 per hour), 1pt `line` left border, title 13/600, time 11 `mid`;
 * the current programme fills cyan at 0.09 with a 3pt cyan tally.
 */
export const LiveTVGuideRow = ({
  channel,
  programs,
  gridStart,
  scrollX = 0,
  isVisible = true,
}: {
  channel: BaseItemDto;
  programs?: BaseItemDto[] | null;
  gridStart: Date;
  scrollX?: number;
  isVisible?: boolean;
}) => {
  const programsWithPositions = useMemo(() => {
    const start0 = gridStart.getTime();
    return programs
      ?.filter((p) => p.ChannelId === channel.Id && p.StartDate && p.EndDate)
      .map((p) => {
        const s = Math.max(new Date(p.StartDate!).getTime(), start0);
        const e = new Date(p.EndDate!).getTime();
        const position = ((s - start0) / 3600000) * GUIDE_HOUR_WIDTH;
        const width = Math.max(((e - s) / 3600000) * GUIDE_HOUR_WIDTH, 0);
        return { ...p, width, position };
      })
      .filter((p) => p.width > 0);
  }, [programs, channel.Id, gridStart]);

  const isCurrentlyLive = (program: BaseItemDto) => {
    if (!program.StartDate || !program.EndDate) return false;
    const now = new Date();
    const start = new Date(program.StartDate);
    const end = new Date(program.EndDate);
    return now >= start && now <= end;
  };

  if (!isVisible) {
    return <View style={{ height: GUIDE_ROW_HEIGHT }} />;
  }

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
      {programsWithPositions?.map((p) => {
        const live = isCurrentlyLive(p);
        return (
          <TouchableItemRouter item={p} key={p.Id}>
            <View
              style={{
                width: p.width,
                height: "100%",
                position: "absolute",
                left: p.position,
                backgroundColor: live
                  ? rgba(NeonBoard.cyan, 0.09)
                  : "transparent",
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
              <View
                style={{
                  marginLeft: scrollX > p.position ? scrollX - p.position : 0,
                  paddingHorizontal: 10,
                }}
              >
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
                  {timeRange(p.StartDate, p.EndDate)}
                </Text>
              </View>
            </View>
          </TouchableItemRouter>
        );
      })}
    </View>
  );
};
