import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoadingLine } from "@/components/common/LoadingLine";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import DisabledSetting from "@/components/settings/DisabledSetting";
import { Sizes } from "@/constants/neon";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { sortWeaselLibraries } from "@/utils/weaselLibraryOrder";

export default function AppearanceHideLibrariesPage() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ["user-views", user?.Id],
    queryFn: async () => {
      const response = await getUserViewsApi(api!).getUserViews({
        userId: user?.Id,
      });

      return sortWeaselLibraries(response.data.Items) || null;
    },
  });

  if (!settings) return null;

  if (isLoading) return <LoadingLine />;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <DisabledSetting
        disabled={pluginSettings?.hiddenLibraries?.locked === true}
        style={{
          paddingHorizontal: Sizes.gutter,
          paddingTop: Platform.OS === "android" ? 10 : 0,
        }}
      >
        <ListGroup title={t("home.settings.other.hide_libraries")}>
          {data?.map((view) => (
            <ListItem key={view.Id} title={view.Name} onPress={() => {}}>
              <SettingSwitch
                value={settings.hiddenLibraries?.includes(view.Id!) || false}
                onValueChange={(value) => {
                  updateSettings({
                    hiddenLibraries: value
                      ? [...(settings.hiddenLibraries || []), view.Id!]
                      : settings.hiddenLibraries?.filter(
                          (id) => id !== view.Id,
                        ),
                  });
                }}
              />
            </ListItem>
          ))}
        </ListGroup>
        <Text variant='meta' muted className='px-4 mt-2'>
          {t("home.settings.other.select_libraries_you_want_to_hide")}
        </Text>
      </DisabledSetting>
    </ScrollView>
  );
}
