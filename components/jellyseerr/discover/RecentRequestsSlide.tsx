import { useQuery } from "@tanstack/react-query";
import type React from "react";
import type { ViewProps } from "react-native";
import Slide, { type SlideProps } from "@/components/jellyseerr/discover/Slide";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useRequestStatus } from "@/providers/RequestStatusProvider";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type MediaRequest from "@/utils/jellyseerr/server/entity/MediaRequest";
import type { NonFunctionProperties } from "@/utils/jellyseerr/server/interfaces/api/common";

type ExtendedMediaRequest = NonFunctionProperties<MediaRequest> & {
  profileName: string;
  canRemove: boolean;
};

const RequestCard: React.FC<{ request: ExtendedMediaRequest }> = ({
  request,
}) => {
  const { jellyseerrApi } = useJellyseerr();
  const requestStatus = useRequestStatus();

  const { data: details } = useQuery({
    queryKey: [
      "jellyseerr",
      "detail",
      requestStatus.scope,
      request.media.mediaType,
      request.media.tmdbId,
    ],
    queryFn: async () => {
      return request.media.mediaType === MediaType.MOVIE
        ? jellyseerrApi?.movieDetails(request.media.tmdbId)
        : jellyseerrApi?.tvDetails(request.media.tmdbId);
    },
    enabled: !!jellyseerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

  const state = useRequestStatus();
  const refreshedRequest = state.rows.find(
    (r) => r.request.id === request.id,
  )?.request;

  return (
    <JellyseerrPoster
      horizontal
      item={details}
      mediaRequest={refreshedRequest as unknown as MediaRequest}
    />
  );
};

const RecentRequestsSlide: React.FC<SlideProps & ViewProps> = ({
  slide,
  ...props
}) => {
  const state = useRequestStatus();
  const requests = { results: state.rows.slice(0, 10).map((r) => r.request) };

  return (
    requests &&
    requests.results.length > 0 && (
      <Slide
        {...props}
        slide={slide}
        count={requests.results.length}
        data={
          requests.results.map((item) => ({
            ...item,
            profileName: "Unknown",
            canRemove: item.status === 1,
          })) as unknown as ExtendedMediaRequest[]
        }
        keyExtractor={(item) => item.id.toString()}
        renderItem={(item: ExtendedMediaRequest) => (
          <RequestCard request={item} />
        )}
      />
    )
  );
};

export default RecentRequestsSlide;
