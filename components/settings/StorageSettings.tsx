import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { toast } from "sonner-native";
import { useConfirmDialog } from "@/components/common/ConfirmDialog";
import { NeonProgress } from "@/components/common/NeonProgress";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import { NeonBoard } from "@/constants/Colors";
import { Sizes } from "@/constants/neon";
import { useHaptic } from "@/hooks/useHaptic";
import { useDownload } from "@/providers/DownloadProvider";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Props {
  accent?: string;
}

/**
 * STORAGE: a 3pt usage bar in the accent (the app's share) over the rest of
 * the device's used space in `low`, a `meta` note, and Clear cache as a red
 * row that confirms through the P14 dialog.
 */
export const StorageSettings: React.FC<Props> = ({
  accent = NeonBoard.volt,
}) => {
  const { deleteAllFiles, appSizeUsage } = useDownload();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");

  const { data: size } = useQuery({
    queryKey: ["appSize"],
    queryFn: async () => {
      const app = await appSizeUsage();

      return {
        appSize: app.appSize,
        total: app.total,
        remaining: app.remaining,
        used: (app.total - app.remaining) / app.total,
      };
    },
    // Keep the bar moving while a download is writing to disk.
    refetchInterval: 10 * 1000,
  });

  const onDeleteClicked = () => {
    confirm({
      title: t("home.settings.storage.delete_all_downloaded_files_confirm"),
      message: t(
        "home.settings.storage.delete_all_downloaded_files_confirm_desc",
      ),
      confirmLabel: t("common.delete"),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteAllFiles();
          successHapticFeedback();
        } catch (_e) {
          errorHapticFeedback();
          toast.error(t("home.settings.toasts.error_deleting_files"));
        } finally {
          // Reflect the freed space immediately instead of waiting for
          // the next poll.
          queryClient.invalidateQueries({ queryKey: ["appSize"] });
        }
      },
    });
  };

  const calculatePercentage = (value: number, total: number) => {
    return ((value / total) * 100).toFixed(2);
  };

  const appShare = size && size.total > 0 ? size.appSize / size.total : 0;
  const deviceShare = size && size.total > 0 ? size.used : 0;

  return (
    <View>
      <SectionHeader
        title={t("home.settings.storage.storage_title")}
        accent={accent}
        count={
          size
            ? t("home.settings.storage.size_used", {
                used: Number(size.total - size.remaining).bytesToReadable(),
                total: size.total?.bytesToReadable(),
              })
            : undefined
        }
      />
      <View style={{ paddingHorizontal: Sizes.rowLead, paddingTop: 2 }}>
        {/* The app's share in the accent, drawn over the device's used space. */}
        <NeonProgress
          progress={appShare}
          buffered={deviceShare}
          color={accent}
        />
        {size ? (
          <Text variant='meta' muted style={{ marginTop: 8 }}>
            {t("home.settings.storage.app_usage", {
              usedSpace: calculatePercentage(size.appSize, size.total),
            })}
            {" · "}
            {t("home.settings.storage.device_usage", {
              availableSpace: calculatePercentage(
                size.total - size.remaining - size.appSize,
                size.total,
              ),
            })}
          </Text>
        ) : null}
      </View>
      {!Platform.isTV && (
        <ListGroup accent={accent} style={{ marginTop: 8 }}>
          <ListItem
            icon='trash-outline'
            textColor='red'
            onPress={onDeleteClicked}
            title={t("home.settings.storage.delete_all_downloaded_files")}
          />
        </ListGroup>
      )}
      {dialog}
    </View>
  );
};
