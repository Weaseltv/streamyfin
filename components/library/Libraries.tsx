import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { Text } from "@/components/common/Text";
import { LibraryItemCard } from "@/components/library/LibraryItemCard";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { Freshness } from "@/constants/queryFreshness";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";
import { useSettings } from "@/utils/atoms/settings";
import { userViewsQuery } from "@/utils/query/userViews";

const ACCENT = sectionAccent("library");

/** The Library hub: page head "WEASELPLEX · n libraries / LIBRARIES" and typed rows. */
export const Libraries: React.FC = () => {
  useSetPageAccent(ACCENT);
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();

  const { t } = useTranslation();

  // Home's list of libraries, not a second copy under another name: it is
  // already loaded by the time this tab opens. The libraries themselves are
  // not fetched here; a library's page opens on its entry in this list.
  const { data, isLoading } = useQuery({
    ...userViewsQuery(api, user?.Id),
    staleTime: Freshness.catalog,
  });

  const libraries = useMemo(
    () =>
      data
        ?.filter((l) => !settings?.hiddenLibraries?.includes(l.Id!))
        .filter((l) => l.CollectionType !== "books")
        .filter((l) => l.CollectionType !== "music") || [],
    [data, settings?.hiddenLibraries],
  );

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <LoadingLine accent={ACCENT} active={isLoading} />
      <FlashList
        contentContainerStyle={{
          paddingBottom: 150,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        ListHeaderComponent={
          <PageHead
            eyebrow={t("library.eyebrow", { count: libraries.length })}
            title={t("library.title")}
            accent={ACCENT}
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
