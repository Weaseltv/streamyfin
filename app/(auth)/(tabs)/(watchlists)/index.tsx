import { Feather, Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useAtomValue } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, RefreshControl, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingLine } from "@/components/common/LoadingLine";
import { PageHead } from "@/components/common/PageHead";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { ListItem } from "@/components/list/ListItem";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import {
  useStreamystatsEnabled,
  useWatchlistsQuery,
} from "@/hooks/useWatchlists";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { serverHost } from "@/utils/serverHost";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

interface WatchlistCardProps {
  watchlist: StreamystatsWatchlist;
  isOwner: boolean;
  onPress: () => void;
}

/** TV keeps its card; see `WatchlistRow` for the phone. */
const TVWatchlistCard: React.FC<WatchlistCardProps> = ({
  watchlist,
  isOwner,
  onPress,
}) => {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={onPress}
      className='bg-neutral-900 p-4 mx-4 mb-3'
      activeOpacity={0.7}
    >
      <View className='flex-row items-center justify-between mb-2'>
        <Text className='text-lg font-semibold flex-1' numberOfLines={1}>
          {watchlist.name}
        </Text>
        <View className='flex-row items-center gap-2'>
          {isOwner && (
            <View className='bg-volt/20 px-2 py-1'>
              <Text className='text-volt text-xs'>{t("watchlists.you")}</Text>
            </View>
          )}
          <Ionicons
            name={watchlist.isPublic ? "globe-outline" : "lock-closed-outline"}
            size={16}
            color='#9ca3af'
          />
        </View>
      </View>

      {watchlist.description && (
        <Text className='text-neutral-400 text-sm mb-2' numberOfLines={2}>
          {watchlist.description}
        </Text>
      )}

      <View className='flex-row items-center gap-4'>
        <View className='flex-row items-center gap-1'>
          <Ionicons name='film-outline' size={14} color='#9ca3af' />
          <Text className='text-neutral-400 text-sm'>
            {watchlist.itemCount ?? 0}{" "}
            {(watchlist.itemCount ?? 0) === 1
              ? t("watchlists.item")
              : t("watchlists.items")}
          </Text>
        </View>
        {watchlist.allowedItemType && (
          <View className='bg-neutral-800 px-2 py-0.5'>
            <Text className='text-neutral-400 text-xs'>
              {watchlist.allowedItemType}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

/** A hairline row on the stage: name, "n items · Public" meta, volt chevron. */
const WatchlistRow: React.FC<WatchlistCardProps> = ({
  watchlist,
  isOwner,
  onPress,
}) => {
  const { t } = useTranslation();
  const count = watchlist.itemCount ?? 0;
  const meta = [
    `${count} ${count === 1 ? t("watchlists.item") : t("watchlists.items")}`,
    watchlist.isPublic ? t("watchlists.public") : t("watchlists.private"),
    watchlist.description,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ListItem
      title={watchlist.name}
      subtitle={meta}
      onPress={onPress}
      style={{ borderBottomWidth: 1, borderBottomColor: NeonBoard.line }}
      iconAfter={
        <View className='flex flex-row items-center ml-auto' style={{ gap: 8 }}>
          {isOwner ? (
            <Badge text={t("watchlists.you")} tint={NeonBoard.volt} />
          ) : null}
          {watchlist.allowedItemType ? (
            <Badge text={watchlist.allowedItemType} />
          ) : null}
          <Feather name='chevron-right' size={18} color={NeonBoard.volt} />
        </View>
      }
    />
  );
};

const NotConfiguredState: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const goToSettings = () =>
    router.push("/(auth)/(tabs)/(home)/settings/plugins/streamystats/page");

  if (Platform.isTV) {
    return (
      <View className='flex-1 items-center justify-center px-8'>
        <Ionicons name='settings-outline' size={64} color='#4b5563' />
        <Text className='text-xl font-semibold mt-4 text-center'>
          {t("watchlists.not_configured_title")}
        </Text>
        <Text className='text-neutral-400 text-center mt-2 mb-6'>
          {t("watchlists.not_configured_description")}
        </Text>
        <Button onPress={goToSettings} className='px-6'>
          <Text className='font-semibold'>
            {t("watchlists.go_to_settings")}
          </Text>
        </Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <PageHead title={t("watchlists.title")} />
      <EmptyState
        icon='settings'
        title={t("watchlists.not_configured_title")}
        detail={t("watchlists.not_configured_description")}
        action={
          <Button variant='border' onPress={goToSettings}>
            {t("watchlists.go_to_settings")}
          </Button>
        }
      />
    </View>
  );
};

export default function WatchlistsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const streamystatsEnabled = useStreamystatsEnabled();
  const { data: watchlists, isLoading, refetch } = useWatchlistsQuery();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleWatchlistPress = useCallback(
    (watchlistId: number) => {
      router.push(`/(auth)/(tabs)/(watchlists)/${watchlistId}`);
    },
    [router],
  );

  // Separate watchlists into "mine" and "public"
  const { myWatchlists, publicWatchlists } = useMemo(() => {
    if (!watchlists) return { myWatchlists: [], publicWatchlists: [] };

    const mine: StreamystatsWatchlist[] = [];
    const pub: StreamystatsWatchlist[] = [];

    for (const w of watchlists) {
      if (w.userId === user?.Id) {
        mine.push(w);
      } else {
        pub.push(w);
      }
    }

    return { myWatchlists: mine, publicWatchlists: pub };
  }, [watchlists, user?.Id]);

  // Combine into sections for FlashList
  const sections = useMemo(() => {
    const result: Array<
      | { type: "header"; title: string; count: number }
      | { type: "watchlist"; data: StreamystatsWatchlist; isOwner: boolean }
    > = [];

    if (myWatchlists.length > 0) {
      result.push({
        type: "header",
        title: t("watchlists.my_watchlists"),
        count: myWatchlists.length,
      });
      for (const w of myWatchlists) {
        result.push({ type: "watchlist", data: w, isOwner: true });
      }
    }

    if (publicWatchlists.length > 0) {
      result.push({
        type: "header",
        title: t("watchlists.public_watchlists"),
        count: publicWatchlists.length,
      });
      for (const w of publicWatchlists) {
        result.push({ type: "watchlist", data: w, isOwner: false });
      }
    }

    return result;
  }, [myWatchlists, publicWatchlists, t]);

  if (!streamystatsEnabled) {
    return <NotConfiguredState />;
  }

  const isEmpty = !isLoading && (!watchlists || watchlists.length === 0);

  if (Platform.isTV) {
    if (isEmpty) {
      return (
        <View className='flex-1 items-center justify-center px-8'>
          <Ionicons name='list-outline' size={64} color='#4b5563' />
          <Text className='text-xl font-semibold mt-4 text-center'>
            {t("watchlists.empty_title")}
          </Text>
          <Text className='text-neutral-400 text-center mt-2 mb-6'>
            {t("watchlists.empty_description")}
          </Text>
        </View>
      );
    }
    return (
      <FlashList
        data={sections}
        contentInsetAdjustmentBehavior='automatic'
        contentContainerStyle={{
          paddingBottom: 100,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <Text className='text-lg font-bold px-4 pt-4 pb-2'>
                {item.title}
              </Text>
            );
          }
          return (
            <TVWatchlistCard
              watchlist={item.data}
              isOwner={item.isOwner}
              onPress={() => handleWatchlistPress(item.data.id)}
            />
          );
        }}
        getItemType={(item) => item.type}
      />
    );
  }

  const head = (
    <PageHead
      eyebrow={`${serverHost(api?.basePath)} · ${t("watchlists.watchlists_count", { count: watchlists?.length ?? 0 })}`}
      title={t("watchlists.title")}
      style={{ marginBottom: 4 }}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: NeonBoard.stage }}>
      <LoadingLine active={isLoading} />
      <FlashList
        data={sections}
        contentInsetAdjustmentBehavior='automatic'
        contentContainerStyle={{
          paddingBottom: 100,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
        ListHeaderComponent={head}
        ListEmptyComponent={
          isEmpty ? (
            <EmptyState
              icon='list'
              title={t("watchlists.empty_title")}
              detail={t("watchlists.empty_description")}
            />
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={NeonBoard.volt}
            colors={[NeonBoard.volt]}
            progressBackgroundColor={NeonBoard.card}
          />
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return <SectionHeader title={item.title} count={item.count} />;
          }

          return (
            <WatchlistRow
              watchlist={item.data}
              isOwner={item.isOwner}
              onPress={() => handleWatchlistPress(item.data.id)}
            />
          );
        }}
        getItemType={(item) => item.type}
      />
    </View>
  );
}
