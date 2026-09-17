import { FlashList, type FlashListProps } from "@shopify/flash-list";
import React, { useImperativeHandle, useRef } from "react";
import { View, type ViewStyle } from "react-native";
import { NeonBoard } from "@/constants/Colors";
import { Text } from "./Text";

export interface HorizontalScrollRef {
  scrollToIndex: (index: number, viewOffset: number) => void;
}

interface HorizontalScrollProps<T>
  extends Omit<FlashListProps<T>, "renderItem" | "estimatedItemSize" | "data"> {
  data?: T[] | null;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  containerStyle?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  height?: number;
  loading?: boolean;
  extraData?: any;
  noItemsText?: string;
}

export const HorizontalScroll = <T,>(
  props: HorizontalScrollProps<T> & {
    ref?: React.ForwardedRef<HorizontalScrollRef>;
  },
) => {
  const {
    data = [],
    keyExtractor,
    renderItem,
    containerStyle,
    contentContainerStyle,
    loading = false,
    height = 164,
    extraData,
    noItemsText,
    ref,
    ...restProps
  } = props;

  const flashListRef = useRef<React.ComponentRef<typeof FlashList<T>>>(null);

  useImperativeHandle(ref!, () => ({
    scrollToIndex: (index: number, viewOffset: number) => {
      flashListRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0,
        viewOffset,
      });
    },
  }));

  const renderFlashListItem = ({ item, index }: { item: T; index: number }) => (
    <View style={{ marginRight: 10 }}>{renderItem(item, index)}</View>
  );

  if (!data || loading) {
    return (
      <View style={{ paddingHorizontal: 12 }}>
        <View
          style={{
            height: 96,
            marginBottom: 8,
            backgroundColor: NeonBoard.card2,
          }}
        />
        <View
          style={{
            height: 40,
            marginBottom: 4,
            backgroundColor: NeonBoard.card2,
          }}
        />
      </View>
    );
  }

  return (
    <View style={[{ height }, containerStyle]}>
      <FlashList<T>
        ref={flashListRef}
        data={data}
        extraData={extraData}
        renderItem={renderFlashListItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 12,
          ...contentContainerStyle,
        }}
        keyExtractor={keyExtractor}
        ListEmptyComponent={() => (
          <View className='flex-1 justify-center items-center'>
            <Text variant='meta' muted className='text-center'>
              {noItemsText || "No data available"}
            </Text>
          </View>
        )}
        {...restProps}
      />
    </View>
  );
};
