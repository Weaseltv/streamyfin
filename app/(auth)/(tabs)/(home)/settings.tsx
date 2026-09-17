import { t } from "i18next";
import { useAtomValue } from "jotai";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PageHead } from "@/components/common/PageHead";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { AppLanguageSelector } from "@/components/settings/AppLanguageSelector";
import { QuickConnect } from "@/components/settings/QuickConnect";
import { StorageSettings } from "@/components/settings/StorageSettings";
import { UserInfo } from "@/components/settings/UserInfo";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { serverHost } from "@/utils/serverHost";

// TV-specific settings component
const SettingsTV = Platform.isTV ? require("./settings.tv").default : null;

const ACCENT = NeonBoard.volt;

// Mobile settings component
function SettingsMobile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

  const host = serverHost(api?.basePath);
  const eyebrow = [user?.Name, host].filter(Boolean).join(" · ");

  return (
    <ScrollView
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: Math.max(24, insets.bottom),
      }}
    >
      <PageHead
        eyebrow={eyebrow}
        title={t("home.settings.settings_title")}
        accent={ACCENT}
      />

      <View style={{ paddingHorizontal: Sizes.gutter }}>
        <UserInfo accent={ACCENT} />

        <QuickConnect accent={ACCENT} />

        {Platform.OS !== "ios" && (
          <ListGroup title={t("pairing.pair_with_phone_title")} accent={ACCENT}>
            <ListItem
              onPress={() =>
                router.push("/(auth)/(tabs)/(home)/companion-login")
              }
              icon='phone-portrait-outline'
              showArrow
              title={t("pairing.pair_with_phone")}
            />
          </ListGroup>
        )}

        <AppLanguageSelector />

        <ListGroup title={t("home.settings.categories.title")} accent={ACCENT}>
          <ListItem
            onPress={() => router.push("/settings/playback-controls/page")}
            icon='play-outline'
            showArrow
            title={t("home.settings.playback_controls.title")}
          />
          <ListItem
            onPress={() => router.push("/settings/audio-subtitles/page")}
            icon='chatbox-ellipses-outline'
            showArrow
            title={t("home.settings.audio_subtitles.title")}
          />
          <ListItem
            onPress={() => router.push("/settings/music/page")}
            icon='musical-notes-outline'
            showArrow
            title={t("home.settings.music.title")}
          />
          <ListItem
            onPress={() => router.push("/settings/appearance/page")}
            icon='text-outline'
            showArrow
            title={t("home.settings.appearance.title")}
          />
          <ListItem
            onPress={() => router.push("/settings/plugins/page")}
            icon='options-outline'
            showArrow
            title={t("home.settings.plugins.plugins_title")}
          />
          <ListItem
            onPress={() => router.push("/settings/intro/page")}
            icon='play-skip-forward-outline'
            showArrow
            title={t("home.settings.intro.title")}
          />
          <ListItem
            onPress={() => router.push("/settings/network/page")}
            icon='wifi-outline'
            showArrow
            title={t("home.settings.network.title")}
          />
          <ListItem
            onPress={() => router.push("/settings/logs/page")}
            icon='document-text-outline'
            showArrow
            title={t("home.settings.logs.logs_title")}
          />
        </ListGroup>

        <StorageSettings accent={ACCENT} />
      </View>
    </ScrollView>
  );
}

export default function settings() {
  // Use TV settings component on TV platforms
  if (Platform.isTV && SettingsTV) {
    return <SettingsTV />;
  }

  return <SettingsMobile />;
}
