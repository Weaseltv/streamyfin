import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  WatchlistForm,
  type WatchlistFormValues,
} from "@/components/watchlists/WatchlistForm";
import useRouter from "@/hooks/useAppRouter";
import { useDismissKeyboardOnLeave } from "@/hooks/useDismissKeyboardOnLeave";
import { useCreateWatchlist } from "@/hooks/useWatchlistMutations";

export default function CreateWatchlistScreen() {
  useDismissKeyboardOnLeave();
  const { t } = useTranslation();
  const router = useRouter();
  const createWatchlist = useCreateWatchlist();

  const handleCreate = useCallback(
    async (values: WatchlistFormValues) => {
      try {
        await createWatchlist.mutateAsync({
          name: values.name.trim(),
          description: values.description.trim() || undefined,
          isPublic: values.isPublic,
          allowedItemType: values.allowedItemType,
          defaultSortOrder: values.defaultSortOrder,
        });
        router.back();
      } catch {
        // Error handled by mutation
      }
    },
    [createWatchlist, router],
  );

  return (
    <WatchlistForm
      submitLabel={t("watchlists.create_button")}
      submitIcon='plus'
      pending={createWatchlist.isPending}
      onSubmit={handleCreate}
      autoFocusName
    />
  );
}
