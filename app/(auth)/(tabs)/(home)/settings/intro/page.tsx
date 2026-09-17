import { useTranslation } from "react-i18next";
import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { Sizes } from "@/constants/neon";
import { useIntroSheet } from "@/providers/IntroSheetProvider";
import { storage } from "@/utils/mmkv";

export default function IntroPage() {
  const { showIntro } = useIntroSheet();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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
        }}
      >
        <ListGroup title={t("home.settings.intro.title")}>
          <ListItem
            onPress={() => {
              showIntro();
            }}
            title={t("home.settings.intro.show_intro")}
            icon='play-circle-outline'
            showArrow
          />
          <ListItem
            textColor='red'
            onPress={() => {
              storage.set("hasShownIntro", false);
            }}
            title={t("home.settings.intro.reset_intro")}
            icon='refresh-outline'
          />
        </ListGroup>
        <View className='h-24' />
      </View>
    </ScrollView>
  );
}
