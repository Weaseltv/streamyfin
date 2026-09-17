import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";

interface Props extends ViewProps {
  item: BaseItemDto;
}

export const MoviesTitleHeader: React.FC<Props> = ({ item, ...props }) => {
  return (
    <View {...props}>
      <Text variant='display' style={{ marginBottom: 4 }}>
        {item?.Name ?? ""}
      </Text>
      <Text variant='meta' muted>
        {item?.ProductionYear}
      </Text>
    </View>
  );
};
