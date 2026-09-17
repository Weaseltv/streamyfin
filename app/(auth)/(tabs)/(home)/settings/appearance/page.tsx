import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { Sizes } from "@/constants/neon";

export default function AppearancePage() {
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
        <AppearanceSettings />
        <View className='h-24' />
      </View>
    </ScrollView>
  );
}
