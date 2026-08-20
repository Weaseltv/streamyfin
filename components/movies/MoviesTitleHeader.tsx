import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { GradientText } from "@/components/prismatic/GradientText";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const MoviesTitleHeader: React.FC<Props> = ({ item, ...props }) => {
  return (
    <View {...props}>
      <GradientText
        style={{ fontWeight: "bold", fontSize: 24, marginBottom: 4 }}
      >
        {item?.Name ?? ""}
      </GradientText>
      <Text className='opacity-50'>{item?.ProductionYear}</Text>
    </View>
  );
};
