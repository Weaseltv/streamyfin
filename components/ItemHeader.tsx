import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { View, type ViewProps } from "react-native";
import { ItemSlate } from "@/components/item/ItemSlate";
import { NeonBoard } from "@/constants/Colors";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

/** The item slate (poster for movies; eyebrow + title + meta for the rest). */
export const ItemHeader: React.FC<Props> = ({ item, ...props }) => {
  if (!item)
    return (
      <View
        className='flex flex-col space-y-1.5 w-full items-start h-32'
        {...props}
      >
        <View
          style={{ width: "33%", height: 12, backgroundColor: NeonBoard.card2 }}
        />
        <View
          style={{ width: "66%", height: 30, backgroundColor: NeonBoard.card2 }}
        />
        <View
          style={{ width: "50%", height: 14, backgroundColor: NeonBoard.card2 }}
        />
      </View>
    );

  return (
    <View {...props}>
      <ItemSlate item={item} poster={item.Type === "Movie"} />
    </View>
  );
};
