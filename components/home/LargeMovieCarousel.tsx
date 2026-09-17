import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import React from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { HeroBand } from "@/components/home/HeroBand";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

interface Props extends ViewProps {}

/**
 * The Home hero band fed by the Streamyfin "popular" plugin (`sf_carousel`
 * tag). Falls back to nothing when the plugin is off; Home then shows the
 * continue-watching hero instead.
 */
export const LargeMovieCarousel: React.FC<Props> = ({ ...props }) => {
  const { settings } = useSettings();
  const { t } = useTranslation();

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data: sf_carousel, isFetching: l1 } = useQuery({
    queryKey: ["sf_carousel", user?.Id, settings?.mediaListCollectionIds],
    queryFn: async () => {
      if (!api || !user?.Id) return null;

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        tags: ["sf_carousel"],
        recursive: true,
        fields: ["Tags"],
        includeItemTypes: ["BoxSet"],
      });

      return response.data.Items?.[0].Id || null;
    },
    enabled: !!api && !!user?.Id && settings?.usePopularPlugin === true,
    staleTime: 60 * 1000,
  });

  const { data: popularItems, isFetching: l2 } = useQuery<BaseItemDto[]>({
    queryKey: ["popular", user?.Id],
    queryFn: async () => {
      if (!api || !user?.Id || !sf_carousel) return [];

      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        parentId: sf_carousel,
        limit: 10,
        fields: ["MediaStreams"],
      });

      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id && !!sf_carousel,
    staleTime: 60 * 1000,
  });

  if (settings?.usePopularPlugin === false) return null;
  if (l1 || l2) return null;
  if (!popularItems || popularItems.length === 0) return null;

  return (
    <View {...props}>
      <HeroBand items={popularItems} eyebrow={t("home.featured")} />
    </View>
  );
};
