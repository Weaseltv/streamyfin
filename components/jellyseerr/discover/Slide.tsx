import { FlashList } from "@shopify/flash-list";
import { t } from "i18next";
import type React from "react";
import type { PropsWithChildren } from "react";
import { View, type ViewProps, type ViewStyle } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { RAIL_GAP } from "@/components/home/ItemCard";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import type DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";

export interface SlideProps {
  slide: DiscoverSlider;
  contentContainerStyle?: ViewStyle;
  /** Trailing count on the rule (finite lists only). */
  count?: number;
}

interface Props<T> extends SlideProps {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactElement | null | undefined;
  keyExtractor: (item: T) => string;
  onEndReached?: (() => void) | null | undefined;
}

/** A discover rail: section head on a volt rule, cards on a 12 gutter with a 10 gap. */
const Slide = <T,>({
  data,
  slide,
  renderItem,
  keyExtractor,
  onEndReached,
  contentContainerStyle,
  count,
  ...props
}: PropsWithChildren<Props<T> & ViewProps>) => {
  return (
    <View {...props}>
      <SectionHeader
        title={t(
          `search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`,
        )}
        accent={NeonBoard.volt}
        count={count}
      />
      <FlashList
        horizontal
        contentContainerStyle={{
          paddingHorizontal: Sizes.gutter,
          ...(contentContainerStyle ? contentContainerStyle : {}),
        }}
        showsHorizontalScrollIndicator={false}
        keyExtractor={keyExtractor}
        data={data}
        onEndReachedThreshold={1}
        onEndReached={onEndReached}
        renderItem={({ item, index }) =>
          item ? (
            <View style={{ marginRight: RAIL_GAP }}>
              {renderItem(item, index)}
            </View>
          ) : null
        }
      />
    </View>
  );
};

export default Slide;
