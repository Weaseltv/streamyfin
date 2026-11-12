import { FlashList } from "@shopify/flash-list";
import type React from "react";
import { type PropsWithChildren, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { GridSkeleton } from "./GridSkeleton";
import { ReadyBackdrop } from "./ReadyBackdrop";

type Render = React.ComponentType<any> | React.ReactElement | null | undefined;

interface Props<T> {
  data: T[];
  images: string[];
  logo?: React.ReactElement;
  HeaderContent?: () => React.ReactElement;
  MainContent?: () => React.ReactElement;
  listHeader: string;
  renderItem: (item: T, index: number) => Render;
  keyExtractor: (item: T) => string;
  onEndReached?: (() => void) | null | undefined;
  isLoading?: boolean;
  isFetching?: boolean;
  backdropIdentity: string;
  isError?: boolean;
  onRetry?: () => void;
}

const ParallaxSlideShow = <T,>({
  data,
  images,
  logo,
  HeaderContent,
  MainContent,
  listHeader,
  renderItem,
  keyExtractor,
  onEndReached,
  isLoading = false,
  isFetching = false,
  backdropIdentity,
  isError = false,
  onRetry,
}: PropsWithChildren<Props<T> & ViewProps>) => {
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();
  const usableImages = useMemo(
    () => [...new Set(images.filter(Boolean))],
    [images],
  );

  return (
    <View
      className='flex-1 relative'
      style={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <ParallaxScrollView
        className='flex-1 opacity-100'
        headerHeight={300}
        onEndReached={onEndReached}
        headerImage={
          <ReadyBackdrop key={backdropIdentity} images={usableImages} />
        }
        logo={logo}
      >
        <View className='flex flex-col space-y-4 px-4'>
          <View className='flex flex-row justify-between w-full'>
            <View className='flex flex-col w-full'>{HeaderContent?.()}</View>
          </View>
          {MainContent?.()}
          <View>
            {isError && (
              <View style={{ gap: 8, paddingVertical: 16 }}>
                <Text variant='meta' muted>
                  {t("home.section_failed")}
                </Text>
                <Button variant='border' loading={isFetching} onPress={onRetry}>
                  {t("home.retry")}
                </Button>
              </View>
            )}
            {isLoading ? (
              <View>
                <Text className='text-lg font-bold my-2'>{listHeader}</Text>
                <View className='px-4'>
                  <View className='flex flex-row flex-wrap'>
                    {Array.from({ length: 9 }, (_, i) => (
                      <GridSkeleton key={i} index={i} />
                    ))}
                  </View>
                </View>
              </View>
            ) : (
              <FlashList
                data={data}
                ListEmptyComponent={
                  <View className='flex flex-col items-center justify-center h-full'>
                    {!isError && (
                      <Text className='font-bold text-xl text-neutral-500'>
                        {t("home.no_items")}
                      </Text>
                    )}
                  </View>
                }
                contentInsetAdjustmentBehavior='automatic'
                ListHeaderComponent={
                  <Text className='text-lg font-bold my-2'>{listHeader}</Text>
                }
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                //@ts-expect-error
                renderItem={({ item, index }) => renderItem(item, index)}
                keyExtractor={keyExtractor}
                numColumns={3}
                ItemSeparatorComponent={() => <View className='h-2 w-2' />}
              />
            )}
          </View>
        </View>
      </ParallaxScrollView>
    </View>
  );
};

export default ParallaxSlideShow;
