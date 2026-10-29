import { useQuery } from "@tanstack/react-query";
import type React from "react";
import type { ViewProps } from "react-native";
import Slide, { type SlideProps } from "@/components/jellyseerr/discover/Slide";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { useJellyseerr } from "@/hooks/useJellyseerr";
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
  const { jellyseerrApi, jellyseerrUser } = useJellyseerr();

  const { data: details } = useQuery({
    queryKey: [
      "jellyseerr",
      "detail",
      jellyseerrApi?.axios.defaults.baseURL,
      jellyseerrUser?.id,
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

  return (
    <JellyseerrPoster
      horizontal
      showDownloadInfo
      item={details}
      mediaRequest={request as unknown as MediaRequest}
    />
  );
};

const RecentRequestsSlide: React.FC<SlideProps & ViewProps> = ({
  slide,
  ...props
}) => {
  const { jellyseerrApi, jellyseerrUser } = useJellyseerr();

  const { data: requests } = useQuery({
    queryKey: [
      "jellyseerr",
      "recent_requests",
      jellyseerrApi?.axios.defaults.baseURL,
      jellyseerrUser?.id,
    ],
    queryFn: async () => jellyseerrApi?.requests(),
    enabled: !!jellyseerrApi,
    refetchOnMount: true,
    staleTime: 0,
  });

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
            profileName: item.profileName ?? "Unknown",
            canRemove: Boolean(item.canRemove),
          })) as ExtendedMediaRequest[]
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
