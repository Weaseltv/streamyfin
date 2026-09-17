import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtom } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { POSTER_CAROUSEL_HEIGHT } from "@/constants/Values";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { HorizontalScroll } from "../common/HorizontalScroll";
import { SectionHeader } from "../common/SectionHeader";
import { Text } from "../common/Text";
import Poster from "../posters/Poster";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const CurrentSeries: React.FC<Props> = ({ item, ...props }) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View {...props}>
      <SectionHeader title={t("item_card.series")} accent={NeonBoard.yellow} />
      <HorizontalScroll
        data={[item]}
        height={POSTER_CAROUSEL_HEIGHT}
        renderItem={(item, _index) => (
          <TouchableOpacity
            key={item?.Id}
            onPress={() =>
              item?.SeriesId && router.push(`/series/${item.SeriesId}`)
            }
            style={{ width: 110 }}
          >
            <Poster
              id={item?.Id}
              url={getPrimaryImageUrlById({ api, id: item?.ParentId })}
            />
            <Text
              variant='cardTitle'
              numberOfLines={1}
              style={{ marginTop: 6 }}
            >
              {item?.SeriesName}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};
