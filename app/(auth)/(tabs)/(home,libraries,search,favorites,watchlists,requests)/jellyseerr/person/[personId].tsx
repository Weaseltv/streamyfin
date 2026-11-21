import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import orderBy from "lodash/orderBy";
import uniqBy from "lodash/uniqBy";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import ParallaxSlideShow from "@/components/jellyseerr/ParallaxSlideShow";
import { Loader } from "@/components/Loader";
import { OverviewText } from "@/components/OverviewText";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { NeonBoard } from "@/constants/Colors";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import type { PersonCreditCast } from "@/utils/jellyseerr/server/models/Person";

export default function JellyseerrPersonPage() {
  const local = useLocalSearchParams();
  const { t } = useTranslation();

  const {
    jellyseerrApi,
    jellyseerrRegion: region,
    jellyseerrLocale: locale,
  } = useJellyseerr();

  const { personId } = local as { personId: string };

  const details = useQuery({
    queryKey: [
      "jellyseerr",
      "person",
      jellyseerrApi?.axios.defaults.baseURL,
      personId,
      "details",
    ],
    queryFn: ({ signal }) => jellyseerrApi!.personDetails(personId, signal),
    enabled: !!jellyseerrApi && !!personId,
    retry: 1,
  });
  const credits = useQuery({
    queryKey: [
      "jellyseerr",
      "person",
      jellyseerrApi?.axios.defaults.baseURL,
      personId,
      "credits",
    ],
    queryFn: ({ signal }) =>
      jellyseerrApi!.personCombinedCredits(personId, signal),
    enabled: !!jellyseerrApi && !!personId,
    retry: 1,
  });
  const data = { details: details.data, combinedCredits: credits.data };
  const portrait = data.details?.profilePath
    ? jellyseerrApi?.imageProxy(
        data.details.profilePath,
        "w600_and_h600_bestv2",
      )
    : undefined;
  const [failedPortrait, setFailedPortrait] = useState<string>();

  const castedRoles: PersonCreditCast[] = useMemo(
    () =>
      uniqBy(
        orderBy(
          data?.combinedCredits?.cast,
          ["voteCount", "voteAverage"],
          "desc",
        ),
        "id",
      ),
    [data?.combinedCredits],
  );
  const backdrops = useMemo(
    () =>
      jellyseerrApi
        ? castedRoles
            .filter((c) => !!c.backdropPath)
            .map((c) =>
              jellyseerrApi.imageProxy(
                c.backdropPath,
                "w1920_and_h800_multi_faces",
              ),
            )
        : [],
    [jellyseerrApi, castedRoles],
  );

  return (
    <ParallaxSlideShow
      backdropIdentity={`personId:${jellyseerrApi?.axios.defaults.baseURL}:${personId}`}
      data={castedRoles}
      images={backdrops}
      listHeader={t("jellyseerr.appearances")}
      keyExtractor={(item) => item.id.toString()}
      isLoading={credits.isPending}
      isFetching={credits.isFetching}
      isError={credits.isError}
      onRetry={() => {
        void credits.refetch();
      }}
      logo={
        portrait && failedPortrait !== portrait ? (
          <Image
            key={portrait}
            source={{ uri: portrait }}
            cachePolicy='memory-disk'
            contentFit='cover'
            onError={() => setFailedPortrait(portrait)}
            style={{ width: 125, height: 125, borderRadius: 63 }}
          />
        ) : (
          <View
            style={{
              width: 125,
              height: 125,
              borderRadius: 63,
              backgroundColor: NeonBoard.card2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name='user' size={40} color={NeonBoard.mid} />
          </View>
        )
      }
      HeaderContent={() => (
        <>
          {details.isPending && <Loader />}
          {details.isError && (
            <Button
              variant='border'
              loading={details.isFetching}
              onPress={() => details.refetch()}
            >
              {t("home.retry")}
            </Button>
          )}
          <Text className='font-bold text-2xl mb-1'>{data?.details?.name}</Text>
          {data.details &&
            (data.details.birthday || data.details.placeOfBirth) && (
              <Text className='opacity-50'>
                {t("jellyseerr.born")}{" "}
                {data?.details?.birthday &&
                  new Date(data.details.birthday).toLocaleDateString(
                    `${locale}-${region}`,
                    {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    },
                  )}{" "}
                | {data?.details?.placeOfBirth}
              </Text>
            )}
        </>
      )}
      MainContent={() => (
        <OverviewText text={data?.details?.biography} className='mt-4' />
      )}
      renderItem={(item, _index) => <JellyseerrPoster item={item} />}
    />
  );
}
