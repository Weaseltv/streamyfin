import { Stack, Tabs, useSegments } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { NeonTabBar } from "@/components/common/NeonTabBar";
import type { TVNavBarTab } from "@/components/tv/TVNavBar";
import { TVNavBar } from "@/components/tv/TVNavBar";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import {
  isTabRoute,
  useTVHomeBackHandler,
  useTVTabRootBackHandler,
} from "@/hooks/useTVBackHandler";
import { useWeaselSeerrAutoConnect } from "@/hooks/useWeaselSeerrAutoConnect";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";

// Music components are not available on tvOS (TrackPlayer not supported)
const MiniPlayerBar = Platform.isTV
  ? () => null
  : require("@/components/music/MiniPlayerBar").MiniPlayerBar;
const MusicPlaybackEngine = Platform.isTV
  ? () => null
  : require("@/components/music/MusicPlaybackEngine").MusicPlaybackEngine;

const IS_ANDROID_TV = Platform.isTV && Platform.OS === "android";

function TVTabLayout() {
  const { settings } = useSettings();
  const { t } = useTranslation();
  const segments = useSegments();
  const router = useRouter();

  const currentTab = segments.find(isTabRoute);
  // The generated segment union varies with the route tree (TV vs mobile
  // typegen), so compare as a plain string.
  const lastSegment: string = segments[segments.length - 1] ?? "";
  const atTabRoot = isTabRoute(lastSegment) || lastSegment === "index";

  const tabs: TVNavBarTab[] = useMemo(
    () =>
      [
        { key: "(home)", label: t("tabs.home") },
        { key: "(search)", label: t("tabs.search") },
        { key: "(favorites)", label: t("tabs.favorites") },
        !settings?.streamyStatsServerUrl || settings?.hideWatchlistsTab
          ? null
          : { key: "(watchlists)", label: t("watchlists.title") },
        { key: "(libraries)", label: t("tabs.library") },
        !settings?.showCustomMenuLinks
          ? null
          : { key: "(custom-links)", label: t("tabs.custom_links") },
        { key: "(settings)", label: t("tabs.settings") },
      ].filter((tab): tab is TVNavBarTab => tab !== null),
    [
      settings?.streamyStatsServerUrl,
      settings?.hideWatchlistsTab,
      settings?.showCustomMenuLinks,
      t,
    ],
  );

  const activeTabKey = currentTab ?? "(home)";

  const visibleKeys = useMemo(
    () => new Set(tabs.map((tab) => tab.key)),
    [tabs],
  );

  const handleTabChange = useCallback(
    (key: string) => {
      if (key === currentTab) return;

      if (key === "(home)") eventBus.emit("scrollToTop");
      if (key === "(search)") eventBus.emit("searchTabPressed");

      router.replace(`/(auth)/(tabs)/${key}`);
    },
    [currentTab, router],
  );

  const navigateHome = useCallback(() => {
    router.replace("/(auth)/(tabs)/(home)");
  }, [router]);
  useTVTabRootBackHandler(navigateHome, atTabRoot, currentTab);

  // If current tab is no longer visible (setting changed), navigate to home
  useEffect(() => {
    if (!visibleKeys.has(activeTabKey) && activeTabKey !== "(home)") {
      router.replace("/(auth)/(tabs)/(home)");
    }
  }, [visibleKeys, activeTabKey, router]);

  return (
    <View style={{ flex: 1 }}>
      <SystemBars hidden={false} style='light' />
      <Stack
        screenOptions={{ headerShown: false, animation: "none" }}
        initialRouteName='(home)'
      >
        <Stack.Screen name='index' redirect />
      </Stack>
      <TVNavBar
        tabs={tabs}
        activeTabKey={activeTabKey}
        onTabChange={handleTabChange}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
        }}
      />
    </View>
  );
}

/**
 * Phone tabs: the custom Neon Board bar, always Home · Search · Watchlist ·
 * Library. Streamystats watchlists and custom links are never phone tabs, and
 * Settings opens from the gear in the brand row. TV keeps `TVNavBar`.
 */
export default function TabLayout() {
  const { t } = useTranslation();

  // Must be called before any conditional return (rules of hooks)
  useTVHomeBackHandler();
  // WeaselPlex: silently connect the pinned Seerr server with the Jellyfin
  // session, so requesting works after one Quick Connect sign-in. Here, above
  // the TV/phone split, so every form factor provisions the same way.
  useWeaselSeerrAutoConnect();

  if (IS_ANDROID_TV) {
    return <TVTabLayout />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <SystemBars hidden={false} style='light' />
      <Tabs
        tabBar={(props) => <NeonTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          sceneStyle: { backgroundColor: NeonBoard.stage },
        }}
      >
        <Tabs.Screen redirect name='index' />
        <Tabs.Screen
          listeners={{
            tabPress: () => {
              eventBus.emit("scrollToTop");
            },
          }}
          name='(home)'
          options={{ title: t("tabs.home") }}
        />
        <Tabs.Screen
          listeners={{
            tabPress: () => {
              eventBus.emit("searchTabPressed");
            },
          }}
          name='(search)'
          options={{ title: t("tabs.search") }}
        />
        <Tabs.Screen
          name='(favorites)'
          options={{ title: t("tabs.favorites") }}
        />
        <Tabs.Screen
          name='(libraries)'
          options={{ title: t("tabs.library") }}
        />
        <Tabs.Screen
          name='(watchlists)'
          options={{ title: t("watchlists.title"), href: null }}
        />
        <Tabs.Screen
          name='(custom-links)'
          options={{ title: t("tabs.custom_links"), href: null }}
        />
        <Tabs.Screen
          name='(settings)'
          options={{ title: t("tabs.settings"), href: null }}
        />
      </Tabs>
      <MiniPlayerBar />
      <MusicPlaybackEngine />
    </View>
  );
}
