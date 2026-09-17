import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { PluginSettings } from "@/components/settings/PluginSettings";
import { Sizes } from "@/constants/neon";
import { useSettings } from "@/utils/atoms/settings";

export default function PluginsPage() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { refreshStreamyfinPluginSettings } = useSettings();

  const handleRefreshFromServer = useCallback(async () => {
    // Returns undefined when the API call fails (handled internally).
    const refreshed = await refreshStreamyfinPluginSettings();
    if (refreshed) {
      toast.success(t("home.settings.plugins.streamystats.toasts.refreshed"));
    } else {
      toast.error(
        t("home.settings.plugins.streamystats.toasts.refresh_failed"),
      );
    }
  }, [refreshStreamyfinPluginSettings, t]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: insets.bottom + 16,
      }}
    >
      <View
        style={{
          paddingHorizontal: Sizes.gutter,
          paddingTop: Platform.OS === "android" ? 10 : 0,
        }}
      >
        <PluginSettings />

        {/* Pulls the centralised Streamyfin plugin settings for every plugin,
            so it lives on the plugins index rather than inside Streamystats. */}
        <Button variant='border' onPress={handleRefreshFromServer}>
          {t("home.settings.plugins.streamystats.refresh_from_server")}
        </Button>
      </View>
    </ScrollView>
  );
}
