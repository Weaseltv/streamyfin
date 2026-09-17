import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/Button";
import {
  NeonSheet,
  NeonSheetNote,
  NeonSheetRow,
  neonSheetModalProps,
} from "@/components/common/NeonSheet";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import useRouter from "@/hooks/useAppRouter";
import { storage } from "@/utils/mmkv";

export interface IntroSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const IntroSheet = forwardRef<IntroSheetRef>((_, ref) => {
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { t } = useTranslation();
  const router = useRouter();

  useImperativeHandle(ref, () => ({
    present: () => {
      storage.set("hasShownIntro", true);
      bottomSheetRef.current?.present();
    },
    dismiss: () => {
      bottomSheetRef.current?.dismiss();
    },
  }));

  const handleDismiss = useCallback(() => {
    bottomSheetRef.current?.dismiss();
  }, []);

  const handleGoToSettings = useCallback(() => {
    bottomSheetRef.current?.dismiss();
    router.push("/settings");
  }, []);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      enableDynamicSizing
      {...neonSheetModalProps}
    >
      <NeonSheet
        scroll
        eyebrow={t("home.intro.features_title")}
        title={t("home.intro.welcome_to_streamyfin")}
        onClose={handleDismiss}
        primary={
          <View>
            <Button onPress={handleDismiss}>
              {t("home.intro.done_button")}
            </Button>
            <TouchableOpacity
              onPress={handleGoToSettings}
              accessibilityRole='button'
              style={{ paddingVertical: 16 }}
            >
              <Text
                variant='button'
                accent={NeonBoard.volt}
                style={{ textAlign: "center" }}
              >
                {t("home.intro.go_to_settings_button")}
              </Text>
            </TouchableOpacity>
          </View>
        }
      >
        <NeonSheetNote>
          {t("home.intro.a_free_and_open_source_client_for_jellyfin")}{" "}
          {t("home.intro.features_description")}
        </NeonSheetNote>

        <View style={{ marginTop: 8 }}>
          <NeonSheetRow
            label='Seerr'
            subtitle={t("home.intro.jellyseerr_feature_description")}
            icon='inbox'
          />
          {!Platform.isTV && (
            <>
              <NeonSheetRow
                label={t("home.intro.downloads_feature_title")}
                subtitle={t("home.intro.downloads_feature_description")}
                icon='download'
              />
              <NeonSheetRow
                label='Chromecast'
                subtitle={t("home.intro.chromecast_feature_description")}
                icon='cast'
              />
            </>
          )}
          <NeonSheetRow
            label={t("home.intro.centralised_settings_plugin_title")}
            subtitle={t("home.intro.centralised_settings_plugin_description")}
            icon='settings'
            right={
              <TouchableOpacity
                onPress={() => {
                  Linking.openURL(
                    "https://github.com/streamyfin/jellyfin-plugin-streamyfin",
                  );
                }}
                accessibilityRole='link'
                hitSlop={8}
                style={{ paddingLeft: Sizes.gutter }}
              >
                <Text variant='chip' accent={NeonBoard.volt}>
                  {t("home.intro.read_more")}
                </Text>
              </TouchableOpacity>
            }
          />
        </View>
      </NeonSheet>
    </BottomSheetModal>
  );
});

IntroSheet.displayName = "IntroSheet";
