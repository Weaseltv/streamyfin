import { useSegments } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { TouchableOpacity, type ViewProps } from "react-native";
import GenericSlideCard from "@/components/jellyseerr/discover/GenericSlideCard";
import Slide, { type SlideProps } from "@/components/jellyseerr/discover/Slide";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  COMPANY_LOGO_IMAGE_FILTER,
  type Network,
} from "@/utils/jellyseerr/src/components/Discover/NetworkSlider";
import type { Studio } from "@/utils/jellyseerr/src/components/Discover/StudioSlider";

const COMPANY_CARD_WIDTH = 128;

const CompanySlide: React.FC<
  { data: Network[] | Studio[] } & SlideProps & ViewProps
> = ({ slide, data, ...props }) => {
  const segments = useSegments();
  const { jellyseerrApi } = useJellyseerr();
  const router = useRouter();
  const from = (segments as string[])[2] || "(home)";

  const navigate = useCallback(
    ({ id, image, name }: Network | Studio) =>
      router.push({
        pathname: `/(auth)/(tabs)/${from}/jellyseerr/company/${id}` as any,
        params: { id, image, name, type: slide.type },
      }),
    [slide],
  );

  return (
    <Slide
      {...props}
      slide={slide}
      data={data}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item, _index) => (
        <TouchableOpacity onPress={() => navigate(item)}>
          <GenericSlideCard
            style={{ width: COMPANY_CARD_WIDTH, padding: 16 }}
            id={item.id.toString()}
            url={jellyseerrApi?.imageProxy(
              item.image,
              COMPANY_LOGO_IMAGE_FILTER,
            )}
          />
        </TouchableOpacity>
      )}
    />
  );
};

export default CompanySlide;
