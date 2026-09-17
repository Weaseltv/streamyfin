import { Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudioToggles } from "@/components/settings/AudioToggles";
import { MediaProvider } from "@/components/settings/MediaContext";
import { MpvSubtitleSettings } from "@/components/settings/MpvSubtitleSettings";
import { SubtitleToggles } from "@/components/settings/SubtitleToggles";
import { Sizes } from "@/constants/neon";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";

export default function AudioSubtitlesPage() {
  useDismissKeyboardOnLeave();
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
          paddingBottom: 16,
        }}
      >
        <MediaProvider>
          <AudioToggles className='mb-4' />
          <SubtitleToggles className='mb-4' />
          <MpvSubtitleSettings className='mb-4' />
        </MediaProvider>
      </View>
    </ScrollView>
  );
}
