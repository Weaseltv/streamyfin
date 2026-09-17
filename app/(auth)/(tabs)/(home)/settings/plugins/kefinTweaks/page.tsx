import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KefinTweaksSettings } from "@/components/settings/KefinTweaks";
import { Sizes } from "@/constants/neon";

export default function KefinTweaksPage() {
  const insets = useSafeAreaInsets();

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
        <KefinTweaksSettings />
      </View>
    </ScrollView>
  );
}
