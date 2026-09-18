import { useCallback, useState } from "react";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Favorites } from "@/components/home/Favorites";
import { Favorites as TVFavorites } from "@/components/home/Favorites.tv";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";

const ACCENT = sectionAccent("watchlist");

export default function FavoritesPage() {
  const invalidateCache = useInvalidatePlaybackProgressCache();

  const [loading, setLoading] = useState(false);
  const refetch = useCallback(async () => {
    setLoading(true);
    await invalidateCache();
    setLoading(false);
  }, []);
  const insets = useSafeAreaInsets();

  if (Platform.isTV) {
    return <TVFavorites />;
  }

  return (
    <ScrollView
      nestedScrollEnabled
      contentInsetAdjustmentBehavior='automatic'
      style={{ backgroundColor: NeonBoard.stage }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={refetch}
          tintColor={ACCENT}
          colors={[ACCENT]}
          progressBackgroundColor={NeonBoard.card}
        />
      }
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 16,
      }}
    >
      <View>
        <Favorites />
      </View>
    </ScrollView>
  );
}
