import { getUserViewsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
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

export default function HideLibrariesPage() {
  const { settings, updateSettings, pluginSettings } = useSettings();
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

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
    <DisabledSetting
      disabled={pluginSettings?.hiddenLibraries?.locked === true}
      style={{ paddingHorizontal: Sizes.gutter }}
    >
      <ListGroup>
        {data?.map((view) => (
          <ListItem key={view.Id} title={view.Name} onPress={() => {}}>
            <SettingSwitch
              value={settings.hiddenLibraries?.includes(view.Id!) || false}
              onValueChange={(value) => {
                updateSettings({
                  hiddenLibraries: value
                    ? [...(settings.hiddenLibraries || []), view.Id!]
                    : settings.hiddenLibraries?.filter((id) => id !== view.Id),
                });
              }}
            />
          </ListItem>
        ))}
      </ListGroup>
      <Text variant='meta' muted className='px-3 mt-2'>
        {t("home.settings.other.select_libraries_you_want_to_hide")}
      </Text>
    </DisabledSetting>
  );
}
