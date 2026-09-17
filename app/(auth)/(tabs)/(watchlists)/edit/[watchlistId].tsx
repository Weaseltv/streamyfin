import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { LoadingLine } from "@/components/common/LoadingLine";
import { Text } from "@/components/common/Text";
import {
  WatchlistForm,
  type WatchlistFormValues,
} from "@/components/watchlists/WatchlistForm";
import { NeonBoard } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";
import { useUpdateWatchlist } from "@/hooks/useWatchlistMutations";
import { useWatchlistDetailQuery } from "@/hooks/useWatchlists";
import type {
  StreamystatsWatchlistAllowedItemType,
  StreamystatsWatchlistSortOrder,
} from "@/utils/streamystats/types";

export default function EditWatchlistScreen() {
  useDismissKeyboardOnLeave();
  const { t } = useTranslation();
  const router = useRouter();
  const { watchlistId } = useLocalSearchParams<{ watchlistId: string }>();
  const watchlistIdNum = watchlistId
    ? Number.parseInt(watchlistId, 10)
    : undefined;

  const { data: watchlist, isLoading } =
    useWatchlistDetailQuery(watchlistIdNum);
  const updateWatchlist = useUpdateWatchlist();

  const handleSave = useCallback(
    async (values: WatchlistFormValues) => {
      if (!watchlistIdNum) return;
      try {
        await updateWatchlist.mutateAsync({
          watchlistId: watchlistIdNum,
          data: {
            name: values.name.trim(),
            description: values.description.trim() || undefined,
            isPublic: values.isPublic,
            allowedItemType: values.allowedItemType,
            defaultSortOrder: values.defaultSortOrder,
          },
        });
        router.back();
      } catch {
        // Error handled by mutation
      }
    },
    [watchlistIdNum, updateWatchlist, router],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: NeonBoard.card }}>
        <LoadingLine active />
      </View>
    );
  }

  if (!watchlist) {
    return (
      <View
        className='flex-1 items-center justify-center px-8'
        style={{ backgroundColor: NeonBoard.card }}
      >
        <Text variant='body' muted>
          {t("watchlists.not_found")}
        </Text>
      </View>
    );
  }

  return (
    <WatchlistForm
      // Keyed on the id so a fresh watchlist seeds fresh form state.
      key={watchlist.id}
      initialValues={{
        name: watchlist.name,
        description: watchlist.description ?? "",
        isPublic: watchlist.isPublic,
        allowedItemType:
          (watchlist.allowedItemType as StreamystatsWatchlistAllowedItemType) ??
          null,
        defaultSortOrder:
          (watchlist.defaultSortOrder as StreamystatsWatchlistSortOrder) ??
          "custom",
      }}
      submitLabel={t("watchlists.save_button")}
      submitIcon='check'
      pending={updateWatchlist.isPending}
      onSubmit={handleSave}
    />
  );
}
