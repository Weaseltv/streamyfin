import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  neonRootScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";

export default function CustomMenuLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name='index'
        options={{ ...neonRootScreenOptions, title: t("tabs.custom_links") }}
      />
    </Stack>
  );
}
