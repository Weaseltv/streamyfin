import { View } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { Text } from "../common/Text";

/** Width of one hour in the guide grid; half-hour headers are half of it. */
export const GUIDE_HOUR_WIDTH = 216;
export const GUIDE_HALF_HOUR_WIDTH = GUIDE_HOUR_WIDTH / 2;

/** The grid starts at the top of the current hour. */
export const guideGridStart = (now = new Date()): Date => {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  return start;
};

/** Half-hour headers in cyan-tinted `tally` type on a `line` rule. */
export const HourHeader = ({
  height,
  gridStart,
}: {
  height: number;
  gridStart: Date;
}) => {
  const slots: Date[] = [];
  const end = new Date(gridStart);
  end.setHours(24, 0, 0, 0);
  for (
    let t = new Date(gridStart);
    t < end;
    t = new Date(t.getTime() + 30 * 60000)
  ) {
    slots.push(t);
  }

  return (
    <View
      className='flex flex-row'
      style={{
        height,
        borderBottomWidth: 1,
        borderBottomColor: NeonBoard.line,
      }}
    >
      {slots.map((slot, index) => (
        <View
          key={index}
          style={{
            width: GUIDE_HALF_HOUR_WIDTH,
            justifyContent: "center",
            paddingLeft: 8,
            borderLeftWidth: 1,
            borderLeftColor: NeonBoard.line,
          }}
        >
          <Text
            variant='tally'
            allowFontScaling={false}
            accent={NeonBoard.cyan}
          >
            {slot.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>
      ))}
    </View>
  );
};
