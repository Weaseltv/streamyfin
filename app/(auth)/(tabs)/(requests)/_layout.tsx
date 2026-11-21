import { Redirect, Stack } from "expo-router";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import {
  commonScreenOptions,
  neonRootScreenOptions,
  nestedTabPageScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";
import { ItemNavigationProvider } from "@/providers/ItemNavigationProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { requestsTabVisibleAtom } from "@/utils/atoms/requestStatus";

/**
 * The phone's Requests tab (plan 5.6): request search on top, the member's queue below. Checked
 * before anything mounts, so the index and every nested page (a request title page, a library
 * title, a person) are covered, including one opened directly or restored: never on either TV
 * platform, never while hidden (a kid profile, signed out), and nothing at all while the signed-in
 * identity is still loading.
 */
export default function RequestsLayout() {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const visible = useAtomValue(requestsTabVisibleAtom);

  if (Platform.isTV) return <Redirect href='/(auth)/(tabs)/(home)' />;
  if (!api?.accessToken || !user?.Id) return null;
  if (!visible) return <Redirect href='/(auth)/(tabs)/(home)' />;

  return (
    <ItemNavigationProvider origin='(requests)'>
      <TabStack />
    </ItemNavigationProvider>
  );
}

function TabStack() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name='index'
        options={{ ...neonRootScreenOptions, title: t("tabs.requests") }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
      <Stack.Screen
        name='collections/[collectionId]'
        options={{
          title: "",
          headerShown: true,
          headerBlurEffect: "none",
          headerTransparent: false,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name='jellyseerr/page' options={commonScreenOptions} />
      <Stack.Screen
        name='jellyseerr/person/[personId]'
        options={commonScreenOptions}
      />
      <Stack.Screen
        name='jellyseerr/company/[companyId]'
        options={commonScreenOptions}
      />
      <Stack.Screen
        name='jellyseerr/genre/[genreId]'
        options={commonScreenOptions}
      />
    </Stack>
  );
}
