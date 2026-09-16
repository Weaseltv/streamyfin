import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useMemo } from "react";
import { Platform, View } from "react-native";
import { RainbowProgress } from "@/components/prismatic/RainbowProgress";

interface ProgressBarProps {
  item: BaseItemDto;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ item }) => {
  const progress = useMemo(() => {
    if (item.Type === "Program") {
      if (!item.StartDate || !item.EndDate) {
        return 0;
      }
      const startDate = new Date(item.StartDate);
      const endDate = new Date(item.EndDate);
      const now = new Date();
      const total = endDate.getTime() - startDate.getTime();
      if (total <= 0) {
        return 0;
      }
      const elapsed = now.getTime() - startDate.getTime();
      return (elapsed / total) * 100;
    }
    return item.UserData?.PlayedPercentage || 0;
  }, [item]);

  if (progress <= 0) {
    return null;
  }

  // TV keeps the plain white bar; only the mobile design is prismatic.
  if (Platform.isTV) {
    return (
      <>
        <View
          className={
            "absolute bottom-0 left-0 h-1 bg-neutral-700 opacity-80 w-full"
          }
        />
        <View
          style={{ width: `${progress}%`, backgroundColor: "#ffffff" }}
          className='absolute bottom-0 left-0 h-1'
        />
      </>
    );
  }

  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
      }}
    >
      <RainbowProgress progress={progress / 100} />
    </View>
  );
};
