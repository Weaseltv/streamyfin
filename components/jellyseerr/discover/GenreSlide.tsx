import { useQuery } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { TouchableOpacity, type ViewProps } from "react-native";
import GenericSlideCard from "@/components/jellyseerr/discover/GenericSlideCard";
import Slide, { type SlideProps } from "@/components/jellyseerr/discover/Slide";
import useRouter from "@/hooks/useAppRouter";
import { Endpoints, useJellyseerr } from "@/hooks/useJellyseerr";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import type { GenreSliderItem } from "@/utils/jellyseerr/server/interfaces/api/discoverInterfaces";
import { genreColorMap } from "@/utils/jellyseerr/src/components/Discover/constants";

const GENRE_CARD_WIDTH = 128;

const GenreSlide: React.FC<SlideProps & ViewProps> = ({ slide, ...props }) => {
  const segments = useSegments();
  const { jellyseerrApi } = useJellyseerr();
  const router = useRouter();
  const from = (segments as string[])[2] || "(home)";

  const navigate = useCallback(
    (genre: GenreSliderItem) =>
      router.push({
        pathname: `/(auth)/(tabs)/${from}/jellyseerr/genre/${genre.id}` as any,
        params: { type: slide.type, name: genre.name },
      }),
    [slide],
  );

  const { data } = useQuery({
    queryKey: ["jellyseerr", "discover", slide.type, slide.id],
    queryFn: async () => {
      return jellyseerrApi?.getGenreSliders(
        slide.type === DiscoverSliderType.MOVIE_GENRES
          ? Endpoints.MOVIE
          : Endpoints.TV,
      );
    },
    enabled: !!jellyseerrApi,
  });

  return (
    data && (
      <Slide
        {...props}
        slide={slide}
        data={data}
        keyExtractor={(item) => item.id.toString()}
        renderItem={(item, _index) => (
          <TouchableOpacity onPress={() => navigate(item)}>
            <GenericSlideCard
              style={{ width: GENRE_CARD_WIDTH }}
              id={item.id.toString()}
              title={item.name}
              colors={["transparent", "transparent"]}
              contentFit={"cover"}
              url={jellyseerrApi?.imageProxy(
                item.backdrops?.[0],
                `w780_filter(duotone,${
                  genreColorMap[item.id] ?? genreColorMap[0]
                })`,
              )}
            />
          </TouchableOpacity>
        )}
      />
    )
  );
};

export default GenreSlide;
