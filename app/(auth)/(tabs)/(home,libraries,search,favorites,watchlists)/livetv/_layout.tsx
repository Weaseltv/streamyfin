import { Slot, Stack, withLayoutContext } from "expo-router";
import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "expo-router/js-top-tabs";
import type {
  ParamListBase,
  TabNavigationState,
} from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { NeonHeader } from "@/components/common/NeonHeader";
import { PageHead } from "@/components/common/PageHead";
import { NeonBoard } from "@/constants/Colors";
import { FontFace } from "@/constants/neon";
import { useSetPageAccent } from "@/utils/atoms/pageAccent";

const { Navigator } = createMaterialTopTabNavigator();

export const Tab = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

const Layout = () => {
  const { t } = useTranslation();
  useSetPageAccent(Platform.isTV ? undefined : NeonBoard.cyan);
  // On TV, skip the Material Top Tab Navigator and render children directly
  // The TV version handles its own tab navigation internally
  if (Platform.isTV) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <Slot />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <Stack.Screen
        options={{
          title: t("live_tv.title"),
          header: ({ navigation }) => (
            <NeonHeader
              onBack={navigation.canGoBack() ? navigation.goBack : undefined}
              downloads={false}
            />
          ),
        }}
      />
      <PageHead
        eyebrow={t("live_tv.title")}
        title={t("live_tv.title")}
        trailing={t("live_tv.today")}
        accent={NeonBoard.green}
      />
      <Tab
        initialRouteName='programs'
        keyboardDismissMode='none'
        screenOptions={{
          tabBarBounces: true,
          tabBarLabelStyle: {
            ...FontFace.bodyBold,
            fontSize: 12,
            textTransform: "none",
          },
          tabBarItemStyle: { width: 110, height: 40 },
          tabBarStyle: {
            backgroundColor: NeonBoard.stage,
            borderBottomWidth: 1,
            borderBottomColor: NeonBoard.line,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: NeonBoard.cyan,
          tabBarInactiveTintColor: NeonBoard.mid,
          animationEnabled: true,
          lazy: true,
          swipeEnabled: true,
          tabBarIndicatorStyle: {
            backgroundColor: NeonBoard.cyan,
            height: 2,
            boxShadow: `0 0 10px ${NeonBoard.cyan}`,
          },
          tabBarScrollEnabled: true,
        }}
      >
        <Tab.Screen name='programs' />
        <Tab.Screen name='guide' />
        <Tab.Screen name='channels' />
        <Tab.Screen name='recordings' />
      </Tab>
    </View>
  );
};

export default Layout;
