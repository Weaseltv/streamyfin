import { useLocalSearchParams } from "expo-router";
import type React from "react";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { ItemContent } from "@/components/ItemContent";
import { useItemQuery } from "@/hooks/useItemQuery";
import { useTappedCard } from "@/hooks/useTappedCard";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { useNavTimingStage } from "@/utils/navTiming";
import {
  ALL_DETAIL_ITEM_FIELDS,
  DETAIL_ITEM_FIELDS,
} from "@/utils/query/reusableItemMetadata";
import { titleDetailsState } from "@/utils/tappedCard";

const ItemContentSkeletonTV = Platform.isTV
  ? require("@/components/ItemContentSkeleton.tv").ItemContentSkeletonTV
  : null;

const Page: React.FC = () => {
  const { id } = useLocalSearchParams() as { id: string };
  const { t } = useTranslation();

  const { offline } = useLocalSearchParams() as { offline?: string };
  const isOffline = offline === "true";

  // One complete detail DTO supplies both the page and track defaults.
  // People remains a separate focused query; every Play still negotiates anew.
  const {
    data: item,
    isError,
    isLoading,
    status,
    fetchStatus,
    refetch,
  } = useItemQuery(
    id,
    isOffline,
    Platform.isTV ? ALL_DETAIL_ITEM_FIELDS : DETAIL_ITEM_FIELDS,
  );

  // Phones, online: opened by a tap on a card, the page draws that card's
  // title, artwork and year until `item` arrives. `item` is only ever what
  // the server sent; the card goes to ItemContent beside it, never as it.
  const card = useTappedCard("item", id, !Platform.isTV && !isOffline);
  const preview = item ? undefined : card;
  const detailsFailed =
    !!preview &&
    titleDetailsState({ details: item, status, fetchStatus }) === "failed";
  const retryDetails = useCallback(() => void refetch(), [refetch]);

  useNavTimingStage("item", id, "content", !!item || !!preview);
  useNavTimingStage("item", id, "full", !!item);

  const opacity = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  // Fast fade out when item loads (no setTimeout delay)
  useEffect(() => {
    if (item) {
      opacity.value = withTiming(0, { duration: 150 });
    } else {
      opacity.value = withTiming(1, { duration: 150 });
    }
  }, [item, opacity]);

  // With a card showing, a failure is reported on the page, under the card's
  // title, with a way to try again (ItemContent). Without one, as before.
  if (isError && !preview)
    return (
      <View className='flex flex-col items-center justify-center h-screen w-screen bg-stage'>
        <Text variant='body' muted>
          {t("item_card.could_not_load_item")}
        </Text>
      </View>
    );

  return (
    <OfflineModeProvider isOffline={isOffline}>
      <View className='flex flex-1 relative'>
        {/* Always render ItemContent - it handles loading state internally on TV */}
        <ItemContent
          item={item}
          itemWithSources={item}
          isLoading={isLoading}
          preview={preview}
          detailsFailed={detailsFailed}
          onRetryDetails={retryDetails}
          retryingDetails={detailsFailed && fetchStatus === "fetching"}
        />

        {/* Skeleton overlay - fades out when content loads */}
        {!item && !preview && (
          <Animated.View
            pointerEvents={"none"}
            style={[animatedStyle]}
            className='absolute top-0 left-0 flex flex-col items-start h-screen w-screen z-50 bg-stage'
          >
            {Platform.isTV && ItemContentSkeletonTV ? (
              <ItemContentSkeletonTV />
            ) : (
              <View style={{ paddingHorizontal: 16, width: "100%" }}>
                <View className='h-56 bg-card mb-4 w-full' />
                <View className='h-3 bg-card2 mb-3 w-24' />
                <View className='h-8 bg-card2 mb-2 w-1/2' />
                <View className='h-3 bg-card2 mb-6 w-2/3' />
                <View className='h-12 bg-card2 w-full mb-3' />
                <View className='h-14 bg-card2 w-full mb-3' />
                <View className='h-24 bg-card2 mb-1 w-full' />
              </View>
            )}
          </Animated.View>
        )}
      </View>
    </OfflineModeProvider>
  );
};

export default Page;
