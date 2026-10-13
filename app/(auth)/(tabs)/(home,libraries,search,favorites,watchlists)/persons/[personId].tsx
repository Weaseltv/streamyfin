import type { BaseItemDtoQueryResult } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { Button } from "@/components/Button";
import { InfiniteHorizontalScroll } from "@/components/common/InfiniteHorizontalScroll";
import { ItemImage } from "@/components/common/ItemImage";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { ItemCardText } from "@/components/ItemCardText";
import { Loader } from "@/components/Loader";
import { MoviesTitleHeader } from "@/components/movies/MoviesTitleHeader";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { TVActorPage } from "@/components/persons/TVActorPage";
import MoviePoster from "@/components/posters/MoviePoster";
import { Freshness } from "@/constants/queryFreshness";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";

const page: React.FC = () => {
  const local = useLocalSearchParams();
  const { personId } = local as { personId: string };

  // Render TV-optimized page on TV platforms
  if (Platform.isTV) {
    return <TVActorPage personId={personId} />;
  }

  return <MobileActorPage personId={personId} />;
};

const MobileActorPage: React.FC<{ personId: string }> = ({ personId }) => {
  const { t } = useTranslation();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const {
    data: item,
    isPending: l1,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["item", personId, api?.basePath, user?.Id],
    queryFn: async () =>
      await getUserItemData({
        api,
        userId: user?.Id,
        itemId: personId,
      }),
    enabled: !!personId && !!api && !!user?.Id,
    staleTime: Freshness.person,
  });

  const fetchItems = useCallback(
    async ({
      pageParam,
      signal,
    }: {
      pageParam: number;
      signal?: AbortSignal;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!api || !user?.Id) return null;

      const response = await getItemsApi(api).getItems(
        {
          userId: user.Id,
          personIds: [personId],
          startIndex: pageParam,
          limit: 16,
          sortOrder: ["Descending", "Descending", "Ascending"],
          includeItemTypes: ["Movie", "Series"],
          recursive: true,
          fields: [
            "ParentId",
            "PrimaryImageAspectRatio",
            "ParentId",
            "PrimaryImageAspectRatio",
          ],
          sortBy: ["PremiereDate", "ProductionYear", "SortName"],
          collapseBoxSetItems: false,
        },
        { signal },
      );

      return response.data;
    },
    [api, user?.Id, personId],
  );

  const [failedBackdrop, setFailedBackdrop] = useState<string>();
  const backdropUrl = useMemo(
    () =>
      getBackdropUrl({
        api,
        item,
        quality: 90,
        width: 1000,
      }),
    [api, item],
  );

  if (l1)
    return (
      <View className='justify-center items-center h-full'>
        <Loader />
      </View>
    );

  if (!item?.Id)
    return (
      <View style={{ padding: 24, gap: 12 }}>
        <Text variant='body' muted>
          {t("home.section_failed")}
        </Text>
        <Button variant='border' loading={isFetching} onPress={() => refetch()}>
          {t("home.retry")}
        </Button>
      </View>
    );

  return (
    <ParallaxScrollView
      headerImage={
        backdropUrl && failedBackdrop !== backdropUrl ? (
          <Image
            source={{ uri: backdropUrl }}
            onError={() => setFailedBackdrop(backdropUrl)}
            style={{
              width: "100%",
              height: "100%",
            }}
          />
        ) : (
          <ItemImage item={item} variant='Primary' />
        )
      }
    >
      <View className='flex flex-col space-y-4 my-4'>
        {isError && (
          <Button
            variant='border'
            loading={isFetching}
            onPress={() => refetch()}
          >
            {t("home.retry")}
          </Button>
        )}
        <View className='px-4 mb-4'>
          <MoviesTitleHeader item={item} className='mb-4' />
          <OverviewText text={item.Overview} />
        </View>

        <Text className='px-4 text-2xl font-bold mb-2 text-neutral-100'>
          {t("item_card.appeared_in")}
        </Text>
        <InfiniteHorizontalScroll
          height={247}
          renderItem={(i, idx) => (
            <TouchableItemRouter
              key={idx}
              item={i}
              className={`flex flex-col
              ${"w-28"}
            `}
            >
              <View>
                <MoviePoster item={i} />
                <ItemCardText item={i} />
              </View>
            </TouchableItemRouter>
          )}
          queryFn={fetchItems}
          queryKey={[
            "actor",
            "movies",
            personId,
            api?.basePath ?? "",
            user?.Id ?? "",
          ]}
        />
      </View>
    </ParallaxScrollView>
  );
};

export default page;
