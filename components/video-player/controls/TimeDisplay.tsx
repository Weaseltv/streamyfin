import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { formatTimeString } from "@/utils/time";

interface TimeDisplayProps {
  currentTime: number;
  remainingTime: number;
}

/**
 * Elapsed in `text`, "Ends at" in `mid`, remaining in `mid`: Condensed 700
 * 12 tabular timecodes (no font scaling; the frame is fixed).
 * MPV player uses milliseconds for time values.
 */
export const TimeDisplay: FC<TimeDisplayProps> = ({
  currentTime,
  remainingTime,
}) => {
  const { t } = useTranslation();

  const getFinishTime = () => {
    if (!Number.isFinite(remainingTime)) return "—";
    const now = new Date();
    // remainingTime is in ms
    const finishTime = new Date(now.getTime() + remainingTime);
    return finishTime.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <View className='flex flex-row items-center justify-between mt-2'>
      <Text variant='timecode' allowFontScaling={false}>
        {formatTimeString(currentTime, "ms")}
      </Text>
      <Text variant='timecode' allowFontScaling={false} muted>
        {t("player.ends_at", { time: getFinishTime() })}
      </Text>
      <Text variant='timecode' allowFontScaling={false} muted>
        -{formatTimeString(remainingTime, "ms")}
      </Text>
    </View>
  );
};
