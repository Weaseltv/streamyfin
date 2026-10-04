import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  neonRootScreenOptions,
  nestedTabPageScreenOptions,
  stackScreenOptions,
} from "@/components/stacks/NestedTabPageStack";
import { ItemNavigationProvider } from "@/providers/ItemNavigationProvider";

export default function SearchLayout() {
  return (
    <ItemNavigationProvider origin='(favorites)'>
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
        options={{ ...neonRootScreenOptions, title: t("tabs.favorites") }}
      />
      {Object.entries(nestedTabPageScreenOptions).map(([name, options]) => (
        <Stack.Screen key={name} name={name} options={options} />
      ))}
    </Stack>
  );
}
