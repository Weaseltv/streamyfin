import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { HeaderIconButton, NeonHeader } from "@/components/common/NeonHeader";
import {
  nestedTabPageScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useStreamystatsEnabled } from "@/hooks/useWatchlists";

// The promoted-watchlists "See all" on the home page pushes a fully qualified
// `(watchlists)` path from the home tab, which would otherwise build this tab's
// stack as just [detail] — no back button, and the tab pinned to that watchlist.
// Same reasoning as the `(libraries)` layout; see the comment there.
export const unstable_settings = Platform.isTV ? {} : { anchor: "index" };

export default function WatchlistsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const streamystatsEnabled = useStreamystatsEnabled();

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name='index'
        options={{
          title: t("watchlists.title"),
          headerShown: !Platform.isTV,
          header: () => (
            <NeonHeader
              right={
                streamystatsEnabled ? (
                  <HeaderIconButton
                    name='add'
                    accessibilityLabel={t("watchlists.create_title")}
                    onPress={() =>
                      router.push("/(auth)/(tabs)/(watchlists)/create")
                    }
                  />
                ) : null
              }
            />
          ),
        }}
      />
      <Stack.Screen
        name='[watchlistId]'
        options={{
          title: "",
          headerShown: !Platform.isTV,
          headerBlurEffect: "none",
          headerTransparent: false,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name='create'
        options={{
          title: t("watchlists.create_title"),
          presentation: "modal",
          headerShown: !Platform.isTV,
          headerStyle: { backgroundColor: NeonBoard.card },
          headerTintColor: NeonBoard.text,
          contentStyle: { backgroundColor: NeonBoard.card },
        }}
      />
      <Stack.Screen
        name='edit/[watchlistId]'
        options={{
          title: t("watchlists.edit_title"),
          presentation: "modal",
          headerShown: !Platform.isTV,
          headerStyle: { backgroundColor: NeonBoard.card },
          headerTintColor: NeonBoard.text,
          contentStyle: { backgroundColor: NeonBoard.card },
        }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
