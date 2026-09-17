import { Stack } from "expo-router";
import type { ComponentProps } from "react";
import { Platform } from "react-native";
import { NeonHeader } from "@/components/common/NeonHeader";
import { NeonBoard } from "@/constants/Colors";
import { FontFace } from "@/constants/neon";

type ICommonScreenOptions = ComponentProps<typeof Stack.Screen>["options"];

/**
 * Applied via `<Stack screenOptions={...}>` in every tab layout.
 *
 * The native stack renders its own back button, aligned by UIKit / the Android
 * Toolbar, so screens must never supply a custom `headerLeft` just to go back —
 * that is what knocked every header out of alignment. Headers sit on the flat
 * stage with a Condensed title; nothing is translucent or blurred.
 */
export const stackScreenOptions: ICommonScreenOptions = {
  headerTintColor: NeonBoard.text,
  headerBackButtonDisplayMode: "minimal",
  headerStyle: { backgroundColor: NeonBoard.stage },
  headerTitleStyle: {
    ...FontFace.display,
    fontSize: 20,
    color: NeonBoard.text,
  },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: NeonBoard.stage },
  scrollEdgeEffects: { top: "hidden" },
};

/** Tab roots: the brand row instead of a native title. */
export const neonRootScreenOptions: ICommonScreenOptions = {
  headerShown: !Platform.isTV,
  header: () => <NeonHeader />,
};

export const commonScreenOptions: ICommonScreenOptions = {
  title: "",
  headerShown: !Platform.isTV,
  headerTransparent: true,
  headerShadowVisible: false,
  headerBlurEffect: "none",
  headerStyle: { backgroundColor: "transparent" },
};

const routes = [
  "persons/[personId]",
  "items/page",
  "series/[id]",
  "music/album/[albumId]",
  "music/artist/[artistId]",
  "music/playlist/[playlistId]",
];

export const nestedTabPageScreenOptions: Record<string, ICommonScreenOptions> =
  Object.fromEntries(routes.map((route) => [route, commonScreenOptions]));
