import { useAtomValue } from "jotai";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Favorites } from "@/components/home/Favorites";
import { Favorites as TVFavorites } from "@/components/home/Favorites.tv";
import { NeonBoard, sectionAccent } from "@/constants/Colors";
import { useManualRefresh } from "@/hooks/useManualRefresh";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { favoriteScope } from "@/utils/query/favorites";

const ACCENT = sectionAccent("watchlist");

export default function FavoritesPage() {
  const client = useNetworkAwareQueryClient();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { refreshing: loading, onRefresh: refetch } = useManualRefresh(() =>
    client.forceInvalidateQueries(
      {
        queryKey: favoriteScope(user?.ServerId || api?.basePath, user?.Id),
      },
      { throwOnError: true },
    ),
  );
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
