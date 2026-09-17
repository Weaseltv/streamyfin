import {
  getUserLibraryApi,
  getUserViewsApi,
} from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { Text } from "@/components/common/Text";
import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import { NeonBoard } from "@/constants/Colors";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { serverHost } from "@/utils/serverHost";
import { sortWeaselLibraries } from "@/utils/weaselLibraryOrder";

/** The Library hub: page head "LIBRARY · host · n libraries" and typed rows. */
export const Libraries: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["user-views", user?.Id],
    queryFn: async () => {
      const response = await getUserViewsApi(api!).getUserViews({
        userId: user?.Id,
      });

      return sortWeaselLibraries(response.data.Items) || null;
    },
    staleTime: 60,
  });

  const libraries = useMemo(
    () =>
      data
        ?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!))
        .filter((l) => l.CollectionType !== "books") || [],
    [data, settings?.hiddenLibraries],
  );

  useEffect(() => {
    for (const item of data || []) {
      queryClient.prefetchQuery({
        queryKey: ["library", item.Id],
        queryFn: async () => {
          if (!item.Id || !user?.Id || !api) return null;
          const response = await getUserLibraryApi(api).getItem({
            itemId: item.Id,
            userId: user?.Id,
          });
          return response.data;
        },
        staleTime: 60 * 1000,
      });
    }
  }, [data, api, queryClient, user?.Id]);

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <LoadingLine active={isLoading} />
      <FlashList
        extraData={settings}
        contentContainerStyle={{
          paddingBottom: 150,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        ListHeaderComponent={
          <PageHead
            eyebrow={`${serverHost(api?.basePath)} · ${t("library.libraries_count", { count: libraries.length })}`}
            title={t("tabs.library")}
            style={{ marginBottom: 4 }}
          />
        }
        ListEmptyComponent={
          isLoading ? null : (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text variant='body' muted>
                {t("library.no_libraries_found")}
              </Text>
            </View>
          )
        }
        data={libraries}
        renderItem={({ item }) => <LibraryItemCard library={item} />}
        keyExtractor={(item) => item.Id || ""}
      />
    </View>
  );
};
