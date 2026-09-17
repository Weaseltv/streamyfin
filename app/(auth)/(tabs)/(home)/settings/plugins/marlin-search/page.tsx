import { useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { HeaderButton } from "@/components/common/HeaderButton";
import { ServerUrlStatusText } from "@/components/common/ServerUrlStatusText";
import { SettingSwitch } from "@/components/common/SettingSwitch";
import { Text } from "@/components/common/Text";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { CustomHeaderSelector } from "@/components/settings/CustomHeaderSelector";
import { NeonBoard } from "@/constants/Colors";
import { FontFace, Sizes } from "@/constants/neon";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";
import { useIntegrationHeaders } from "@/hooks/useIntegrationHeaders";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useServerUrlResolver } from "@/hooks/useServerUrlResolver";
import { useSettings } from "@/utils/atoms/settings";
import { reachabilityProbe } from "@/utils/serverUrl/probes/reachability";

// The URL is typed straight into the row, right-aligned like a value.
const urlInputStyle = {
  flex: 1,
  textAlign: "right" as const,
  color: NeonBoard.text,
  fontSize: 13,
  ...FontFace.body,
};

export default function MarlinSearchPage() {
  useDismissKeyboardOnLeave();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  const [value, setValue] = useState<string>(settings?.marlinServerUrl || "");
  const { resolveOptions } = useIntegrationHeaders("marlin");
  const urlResolver = useServerUrlResolver(reachabilityProbe, resolveOptions);

  const searchEngineLocked = pluginSettings?.searchEngine?.locked === true;
  const marlinUrlLocked = pluginSettings?.marlinServerUrl?.locked === true;
  // Effective (user/admin merged) URL, same source the search screen uses —
  // the raw plugin value misses a user-configured Streamystats.
  const hasStreamystats = !!settings?.streamyStatsServerUrl;

  const onSave = async (val: string) => {
    // Persist the canonical resolved URL when the server answers; keep the
    // raw input as fallback so the URL can be saved while the host is down.
    const raw = val.trim();
    let toPersist = !raw.endsWith("/") ? raw : raw.slice(0, -1);
    if (raw) {
      const result = await urlResolver.resolve(raw);
      if (result.ok) {
        toPersist = result.url;
        setValue(result.url);
      }
    }
    updateSettings({ marlinServerUrl: toPersist });
    toast.success(t("home.settings.plugins.marlin_search.toasts.saved"));
  };

  const handleOpenLink = () => {
    Linking.openURL("https://github.com/fredrikburmester/marlin-search");
  };

  useEffect(() => {
    if (!marlinUrlLocked) {
      navigation.setOptions({
        headerRight: () => (
          <HeaderButton variant='text' onPress={() => onSave(value)}>
            <Text variant='button' accent={NeonBoard.volt}>
              {t("home.settings.plugins.marlin_search.save_button")}
            </Text>
          </HeaderButton>
        ),
      });
    }
  }, [navigation, value, marlinUrlLocked, t]);

  if (!settings) return null;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <View
        style={{
          paddingHorizontal: Sizes.gutter,
          paddingTop: Platform.OS === "android" ? 10 : 0,
          paddingBottom: 16,
        }}
      >
        <ListGroup>
          {/* disabledByAdmin renders the "Disabled by admin" notice as the row's
              subtitle (same pattern as the Streamystats settings) — no clipping. */}
          <ListItem
            title={t(
              "home.settings.plugins.marlin_search.enable_marlin_search",
            )}
            disabledByAdmin={searchEngineLocked}
            // Streamystats owns the search engine while configured — block the
            // row tap too, not just the Switch, so it can't force "Jellyfin".
            disabled={hasStreamystats}
            onPress={() => {
              updateSettings({ searchEngine: "Jellyfin" });
              queryClient.invalidateQueries({ queryKey: ["search"] });
            }}
          >
            <SettingSwitch
              value={settings.searchEngine === "Marlin"}
              disabled={searchEngineLocked || hasStreamystats}
              onValueChange={(val) => {
                updateSettings({ searchEngine: val ? "Marlin" : "Jellyfin" });
                queryClient.invalidateQueries({ queryKey: ["search"] });
              }}
            />
          </ListItem>
        </ListGroup>

        <ListGroup className='mt-4'>
          <ListItem
            title={t("home.settings.plugins.marlin_search.url")}
            disabledByAdmin={marlinUrlLocked}
          >
            <TextInput
              editable={!marlinUrlLocked && settings.searchEngine === "Marlin"}
              style={urlInputStyle}
              placeholderTextColor={NeonBoard.low}
              selectionColor={NeonBoard.volt}
              placeholder={t(
                "home.settings.plugins.marlin_search.server_url_placeholder",
              )}
              value={value}
              keyboardType='url'
              returnKeyType='done'
              autoCapitalize='none'
              textContentType='URL'
              onChangeText={(text) => {
                setValue(text);
                // Editing invalidates the previous resolution status.
                urlResolver.reset();
              }}
              onBlur={() => {
                const candidate = value.trim();
                if (candidate) {
                  urlResolver.resolve(candidate).then((r) => {
                    if (r.ok) setValue(r.url);
                  });
                }
              }}
            />
          </ListItem>
        </ListGroup>
        <ServerUrlStatusText state={urlResolver} className='mt-2 px-3' />

        <Text variant='meta' muted className='px-3 mt-2'>
          {t("home.settings.plugins.marlin_search.marlin_search_hint")}{" "}
          <Text variant='meta' accent={NeonBoard.volt} onPress={handleOpenLink}>
            {t("home.settings.plugins.marlin_search.read_more_about_marlin")}
          </Text>
        </Text>

        <View>
          <CustomHeaderSelector
            integrationKey='marlin'
            title={t("custom_headers.title")}
            description={t("custom_headers.integration_description")}
          />
        </View>
      </View>
    </ScrollView>
  );
}
