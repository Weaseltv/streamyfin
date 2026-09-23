import { getLiveTvApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemImage } from "@/components/common/ItemImage";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { ImageWidths } from "@/utils/imageSizes";

export default function LiveTvChannelsPage() {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const _insets = useSafeAreaInsets();

  const { data: channels } = useQuery({
    queryKey: ["livetv", "channels"],
    queryFn: async () => {
      const res = await getLiveTvApi(api!).getLiveTvChannels({
        startIndex: 0,
        limit: 500,
        enableFavoriteSorting: true,
        userId: user?.Id,
        addCurrentProgram: false,
        enableUserData: false,
        enableImageTypes: ["Primary"],
      });
      return res.data;
    },
  });

  return (
    <View className='flex flex-1'>
      <FlashList
        data={channels?.Items}
        renderItem={({ item }) => (
          <View
            style={{
              minHeight: 56,
              flexDirection: "row",
              alignItems: "center",
              paddingLeft: Sizes.rowLead,
              paddingRight: Sizes.gutter,
              gap: 12,
              borderBottomWidth: 1,
              borderBottomColor: NeonBoard.line,
            }}
          >
            <Text
              variant='numeral'
              allowFontScaling={false}
              style={{ width: 32 }}
            >
              {item.ChannelNumber ?? ""}
            </Text>
            <View
              style={{
                width: 44,
                height: 30,
                borderWidth: 1,
                borderColor: NeonBoard.green,
                backgroundColor: NeonBoard.inset,
                overflow: "hidden",
              }}
            >
              <ItemImage
                style={{ width: "100%", height: "100%" }}
                contentFit='contain'
                item={item}
                width={ImageWidths.channelLogo}
              />
            </View>
            <Text variant='rowTitle' numberOfLines={1} style={{ flex: 1 }}>
              {item.Name}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
