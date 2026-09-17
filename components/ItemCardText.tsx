import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { View } from "react-native";
import { runtimeTicksToMinutes } from "@/utils/time";
import { Text } from "./common/Text";

type ItemCardProps = {
  item: BaseItemDto;
};

/** Card caption: title 13/600 on one line, meta 12 in `mid`. */
export const ItemCardText: React.FC<ItemCardProps> = ({ item }) => {
  const left =
    item.RunTimeTicks && item.UserData?.PlaybackPositionTicks
      ? `${runtimeTicksToMinutes(item.RunTimeTicks - item.UserData.PlaybackPositionTicks)} left`
      : null;
  return (
    <View className='mt-1.5 flex flex-col'>
      {item.Type === "Episode" ? (
        <>
          <Text variant='cardTitle' numberOfLines={1} ellipsizeMode='tail'>
            {item.SeriesName ?? item.Name}
          </Text>
          <Text variant='meta' muted numberOfLines={1}>
            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()} · ${item.Name}`}
          </Text>
        </>
      ) : (
        <>
          <Text variant='cardTitle' numberOfLines={1} ellipsizeMode='tail'>
            {item.Name}
          </Text>
          <Text variant='meta' muted numberOfLines={1}>
            {[item.ProductionYear, left].filter(Boolean).join(" · ")}
          </Text>
        </>
      )}
    </View>
  );
};
