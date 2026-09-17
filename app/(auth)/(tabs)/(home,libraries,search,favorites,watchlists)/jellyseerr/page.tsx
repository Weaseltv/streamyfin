import { Feather } from "@expo/vector-icons";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { BottomSheetModalMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation } from "expo-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { NeonSheet, neonSheetModalProps } from "@/components/common/NeonSheet";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import Cast from "@/components/jellyseerr/Cast";
import DetailFacts from "@/components/jellyseerr/DetailFacts";
import { jellyseerrTypeAccent } from "@/components/jellyseerr/JellyseerrMediaIcon";
import RequestModal, {
  type RequestSeason,
} from "@/components/jellyseerr/RequestModal";
import { TVJellyseerrPage } from "@/components/jellyseerr/tv";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { PlatformDropdown } from "@/components/PlatformDropdown";
import { JellyserrRatings } from "@/components/Ratings";
import JellyseerrSeasons from "@/components/series/JellyseerrSeasons";
import { ItemActions } from "@/components/series/SeriesActions";
import { NeonBoard } from "@/constants/Colors";
import { FontFace, Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useJellyseerrCanRequest } from "@/utils/_jellyseerr/useJellyseerrCanRequest";
import { ANIME_KEYWORD_ID } from "@/utils/jellyseerr/server/api/themoviedb/constants";
import {
  type IssueType,
  IssueTypeName,
} from "@/utils/jellyseerr/server/constants/issue";
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type Season from "@/utils/jellyseerr/server/entity/Season";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

// Mobile page component
const MobilePage: React.FC = () => {
  useDismissKeyboardOnLeave();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const router = useRouter();

  const { mediaTitle, releaseYear, posterSrc, mediaType, ...result } =
    params as unknown as {
      mediaTitle: string;
      releaseYear: number;
      canRequest: string;
      posterSrc: string;
      mediaType: MediaType;
    } & Partial<MovieResult | TvResult | MovieDetails | TvDetails>;

  const navigation = useNavigation();
  const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();

  const [issueType, setIssueType] = useState<IssueType>();
  const [issueMessage, setIssueMessage] = useState<string>();
  const [requestBody, _setRequestBody] = useState<MediaRequestBody>();
  const [issueTypeDropdownOpen, setIssueTypeDropdownOpen] = useState(false);
  const advancedReqModalRef = useRef<BottomSheetModalMethods>(null);
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const {
    data: details,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    enabled: !!jellyseerrApi && !!result && !!result.id,
    queryKey: ["jellyseerr", "detail", mediaType, result.id],
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retryOnMount: true,
    refetchInterval: 0,
    queryFn: async () => {
      return mediaType === MediaType.MOVIE
        ? jellyseerrApi?.movieDetails(result.id!)
        : jellyseerrApi?.tvDetails(result.id!);
    },
  });

  const [canRequest, hasAdvancedRequestPermission] =
    useJellyseerrCanRequest(details);

  const canManageRequests = useMemo(() => {
    if (!jellyseerrUser) return false;
    return hasPermission(
      Permission.MANAGE_REQUESTS,
      jellyseerrUser.permissions,
    );
  }, [jellyseerrUser]);

  const pendingRequest = useMemo(() => {
    return details?.mediaInfo?.requests?.find(
      (r: MediaRequest) => r.status === MediaRequestStatus.PENDING,
    );
  }, [details]);

  const handleApproveRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;

    try {
      await jellyseerrApi?.approveRequest(pendingRequest.id);
      toast.success(t("jellyseerr.toasts.request_approved"));
      refetch();
    } catch (error) {
      toast.error(t("jellyseerr.toasts.failed_to_approve_request"));
      console.error("Failed to approve request:", error);
    }
  }, [jellyseerrApi, pendingRequest, refetch, t]);

  const handleDeclineRequest = useCallback(async () => {
    if (!pendingRequest?.id) return;

    try {
      await jellyseerrApi?.declineRequest(pendingRequest.id);
      toast.success(t("jellyseerr.toasts.request_declined"));
      refetch();
    } catch (error) {
      toast.error(t("jellyseerr.toasts.failed_to_decline_request"));
      console.error("Failed to decline request:", error);
    }
  }, [jellyseerrApi, pendingRequest, refetch, t]);

  const submitIssue = useCallback(() => {
    if (result.id && issueType && issueMessage && details) {
      jellyseerrApi
        ?.submitIssue(details.mediaInfo.id, Number(issueType), issueMessage)
        .then(() => {
          setIssueType(undefined);
          setIssueMessage(undefined);
          bottomSheetModalRef?.current?.close();
        });
    }
  }, [jellyseerrApi, details, result, issueType, issueMessage]);

  const handleIssueModalDismiss = useCallback(() => {
    setIssueTypeDropdownOpen(false);
  }, []);

  const setRequestBody = useCallback(
    (body: MediaRequestBody) => {
      _setRequestBody(body);
      advancedReqModalRef?.current?.present?.();
    },
    [requestBody, _setRequestBody, advancedReqModalRef],
  );

  const request = useCallback(async () => {
    const body: MediaRequestBody = {
      mediaId: Number(result.id!),
      mediaType: mediaType!,
      tvdbId: details?.externalIds?.tvdbId,
      ...(mediaType === MediaType.TV && {
        seasons: (details as TvDetails)?.seasons
          ?.filter?.((s) => s.seasonNumber !== 0)
          ?.map?.((s) => s.seasonNumber),
      }),
    };

    if (hasAdvancedRequestPermission) {
      setRequestBody(body);
      return;
    }

    requestMedia(mediaTitle, body, refetch);
  }, [
    details,
    result,
    requestMedia,
    hasAdvancedRequestPermission,
    mediaTitle,
    refetch,
    mediaType,
  ]);

  const accent = jellyseerrTypeAccent(mediaType);

  // Season rows for the request sheet: TMDB seasons with the Seerr status of
  // each (available / requested ones are shown but not selectable).
  const requestSeasons: RequestSeason[] | undefined = useMemo(() => {
    if (mediaType !== MediaType.TV) return undefined;
    const tv = details as TvDetails | undefined;
    if (!tv?.seasons) return undefined;
    const mediaInfoSeasons = tv.mediaInfo?.seasons ?? [];
    const requested =
      tv.mediaInfo?.requests?.flatMap((r: MediaRequest) => r.seasons) ?? [];
    return tv.seasons
      .filter((s) => s.seasonNumber !== 0)
      .map((s) => ({
        seasonNumber: s.seasonNumber,
        episodeCount: s.episodeCount,
        status:
          mediaInfoSeasons.find(
            (m: Season) => m.seasonNumber === s.seasonNumber,
          )?.status ??
          requested.find((r: Season) => r.seasonNumber === s.seasonNumber)
            ?.status ??
          MediaStatus.UNKNOWN,
      }));
  }, [details, mediaType]);

  const isAnime = useMemo(
    () =>
      (details?.keywords.some((k) => k.id === ANIME_KEYWORD_ID) || false) &&
      mediaType === MediaType.TV,
    [details],
  );

  const issueTypeOptionGroups = useMemo(
    () => [
      {
        title: t("jellyseerr.types"),
        options: Object.entries(IssueTypeName)
          .reverse()
          .map(([key, value]) => ({
            type: "radio" as const,
            label: value,
            value: key,
            selected: key === String(issueType),
            onPress: () => setIssueType(key as unknown as IssueType),
          })),
      },
    ],
    [issueType, t],
  );

  useEffect(() => {
    if (details) {
      navigation.setOptions({
        headerRight: () => <ItemActions item={details} />,
      });
    }
  }, [details]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: NeonBoard.stage,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <ParallaxScrollView
        className='flex-1 opacity-100'
        headerHeight={300}
        headerImage={
          <View>
            {result.backdropPath ? (
              <Image
                cachePolicy={"memory-disk"}
                transition={300}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                source={{
                  uri: jellyseerrApi?.imageProxy(
                    result.backdropPath,
                    "w1920_and_h800_multi_faces",
                  ),
                }}
              />
            ) : (
              <View
                style={{
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: NeonBoard.card2,
                  borderBottomWidth: 1,
                  borderBottomColor: NeonBoard.line,
                }}
              >
                <Feather name='image' size={24} color={NeonBoard.low} />
              </View>
            )}
          </View>
        }
      >
        <View style={{ backgroundColor: NeonBoard.stage }}>
          <View style={{ gap: 16 }}>
            <View style={{ paddingHorizontal: Sizes.gutter }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <JellyserrRatings
                    result={
                      result as
                        | MovieResult
                        | TvResult
                        | MovieDetails
                        | TvDetails
                    }
                  />
                  <Text variant='eyebrow' accent={accent} numberOfLines={1}>
                    {`${t("search.discover")} · ${
                      mediaType === MediaType.MOVIE
                        ? t("search.movies")
                        : t("search.series")
                    }`}
                  </Text>
                  <Text
                    selectable
                    variant='display'
                    numberOfLines={3}
                    style={{ marginTop: 2 }}
                  >
                    {mediaTitle}
                  </Text>
                  <Text variant='meta' muted style={{ marginTop: 4 }}>
                    {releaseYear}
                  </Text>
                </View>
                <View
                  style={{
                    width: Sizes.posterSmall.w,
                    height: Sizes.posterSmall.h,
                    borderWidth: 1,
                    borderColor: NeonBoard.line,
                    backgroundColor: NeonBoard.card2,
                    overflow: "hidden",
                  }}
                >
                  <Image
                    style={{ width: "100%", height: "100%" }}
                    cachePolicy={"memory-disk"}
                    transition={300}
                    contentFit='cover'
                    source={{
                      uri: posterSrc,
                    }}
                  />
                </View>
              </View>
              <View>
                <GenreTags
                  accent={accent}
                  genres={details?.genres?.map((g) => g.name) || []}
                />
              </View>
              {isLoading || isFetching ? (
                <Button
                  loading={true}
                  disabled={true}
                  accent={NeonBoard.volt}
                  style={{ marginTop: 16 }}
                />
              ) : canRequest ? (
                <Button
                  accent={NeonBoard.volt}
                  onPress={request}
                  style={{ marginTop: 16 }}
                  iconLeft={
                    <Feather
                      name='inbox'
                      size={18}
                      color={NeonBoard.onAccent}
                    />
                  }
                >
                  {t("jellyseerr.request_button")}
                </Button>
              ) : (
                details?.mediaInfo?.jellyfinMediaId && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                    {!Platform.isTV && (
                      <Button
                        variant='border'
                        color='white'
                        style={{ flex: 1 }}
                        onPress={() => bottomSheetModalRef?.current?.present()}
                        iconLeft={
                          <Feather
                            name='alert-triangle'
                            size={18}
                            color={NeonBoard.text}
                          />
                        }
                      >
                        {t("jellyseerr.report_issue_button")}
                      </Button>
                    )}
                    <Button
                      accent={accent}
                      style={{ flex: 1 }}
                      onPress={() => {
                        router.push({
                          pathname:
                            mediaType === MediaType.MOVIE
                              ? "/(auth)/(tabs)/(search)/items/page"
                              : "/(auth)/(tabs)/(search)/series/[id]",
                          params:
                            mediaType === MediaType.MOVIE
                              ? { id: details?.mediaInfo.jellyfinMediaId }
                              : { id: details?.mediaInfo.jellyfinMediaId },
                        });
                      }}
                      iconLeft={
                        <Feather
                          name='play'
                          size={18}
                          color={NeonBoard.onAccent}
                        />
                      }
                    >
                      {t("common.play")}
                    </Button>
                  </View>
                )
              )}
              {canManageRequests && pendingRequest && (
                <View style={{ gap: 8, marginTop: 16 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Feather name='user' size={14} color={NeonBoard.mid} />
                    <Text variant='meta' muted>
                      {t("jellyseerr.requested_by", {
                        user:
                          pendingRequest.requestedBy?.displayName ||
                          pendingRequest.requestedBy?.username ||
                          pendingRequest.requestedBy?.jellyfinUsername ||
                          t("jellyseerr.unknown_user"),
                      })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button
                      variant='border'
                      accent={NeonBoard.green}
                      style={{ flex: 1 }}
                      onPress={handleApproveRequest}
                      iconLeft={
                        <Feather
                          name='check'
                          size={18}
                          color={NeonBoard.green}
                        />
                      }
                    >
                      {t("jellyseerr.approve")}
                    </Button>
                    <Button
                      variant='border'
                      color='red'
                      style={{ flex: 1 }}
                      onPress={handleDeclineRequest}
                      iconLeft={
                        <Feather name='x' size={18} color={NeonBoard.red} />
                      }
                    >
                      {t("jellyseerr.decline")}
                    </Button>
                  </View>
                </View>
              )}
              <OverviewText text={result.overview} className='mt-4' />
            </View>

            {mediaType === MediaType.TV && (
              <JellyseerrSeasons
                isLoading={isLoading || isFetching}
                details={details as TvDetails}
                refetch={refetch}
                hasAdvancedRequest={hasAdvancedRequestPermission}
                onAdvancedRequest={(data) => setRequestBody(data)}
              />
            )}
            <DetailFacts
              style={{
                paddingHorizontal: Sizes.gutter,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: NeonBoard.line,
              }}
              details={details}
            />
            <Cast details={details} />
          </View>
        </View>
      </ParallaxScrollView>
      <RequestModal
        ref={advancedReqModalRef}
        requestBody={requestBody}
        title={mediaTitle}
        id={result.id!}
        type={mediaType}
        seasons={requestSeasons}
        isAnime={isAnime}
        onRequested={() => {
          _setRequestBody(undefined);
          advancedReqModalRef?.current?.close();
          refetch();
        }}
        onDismiss={() => _setRequestBody(undefined)}
      />
      {!Platform.isTV && (
        // This is till it's fixed because the menu isn't selectable on TV
        <BottomSheetModal
          ref={bottomSheetModalRef}
          enableDynamicSizing
          {...neonSheetModalProps}
          stackBehavior='push'
          onDismiss={handleIssueModalDismiss}
        >
          <NeonSheet
            eyebrow={t("jellyseerr.report_issue_button")}
            title={t("jellyseerr.whats_wrong")}
            accent={NeonBoard.warn}
            onClose={() => bottomSheetModalRef?.current?.close()}
            primary={
              <Button accent={NeonBoard.warn} onPress={submitIssue}>
                {t("jellyseerr.submit_button")}
              </Button>
            }
          >
            <PlatformDropdown
              groups={issueTypeOptionGroups}
              trigger={
                <View
                  style={{
                    minHeight: 52,
                    paddingLeft: Sizes.rowLead,
                    paddingRight: Sizes.gutter,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: NeonBoard.card2,
                    borderBottomWidth: 1,
                    borderBottomColor: NeonBoard.line,
                  }}
                >
                  <Text variant='rowTitle' style={{ flex: 1 }}>
                    {t("jellyseerr.issue_type")}
                  </Text>
                  <Text
                    variant='rowTitle'
                    accent={NeonBoard.warn}
                    numberOfLines={1}
                    style={{ maxWidth: "55%", fontSize: 14 }}
                  >
                    {issueType
                      ? IssueTypeName[issueType]
                      : t("jellyseerr.select_an_issue")}
                  </Text>
                  <Feather
                    name='chevron-down'
                    size={16}
                    color={NeonBoard.warn}
                    style={{ marginLeft: 6 }}
                  />
                </View>
              }
              title={t("jellyseerr.types")}
              open={issueTypeDropdownOpen}
              onOpenChange={setIssueTypeDropdownOpen}
            />
            <View
              style={{
                marginHorizontal: Sizes.gutter,
                marginTop: 12,
                minHeight: 96,
                padding: 12,
                backgroundColor: NeonBoard.card2,
                borderWidth: 1,
                borderColor: NeonBoard.line2,
              }}
            >
              <BottomSheetTextInput
                multiline
                maxLength={254}
                style={{
                  color: NeonBoard.text,
                  ...FontFace.body,
                  fontSize: 15,
                  minHeight: 72,
                  textAlignVertical: "top",
                }}
                selectionColor={NeonBoard.warn}
                cursorColor={NeonBoard.warn}
                clearButtonMode='always'
                placeholder={t("jellyseerr.describe_the_issue")}
                placeholderTextColor={NeonBoard.low}
                // Issue with multiline + Textinput inside a portal
                // https://github.com/callstack/react-native-paper/issues/1668
                defaultValue={issueMessage}
                onChangeText={setIssueMessage}
              />
            </View>
          </NeonSheet>
        </BottomSheetModal>
      )}
    </View>
  );
};

// Platform-conditional page component
const Page: React.FC = () => {
  if (Platform.isTV) {
    return <TVJellyseerrPage />;
  }
  return <MobilePage />;
};

export default Page;
