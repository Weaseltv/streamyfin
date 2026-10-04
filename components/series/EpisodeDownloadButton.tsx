import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { atom, useAtomValue } from "jotai";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { HEADER_ICON_SIZE } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Loader } from "@/components/Loader";
import ProgressCircle from "@/components/ProgressCircle";
import { SquareButton } from "@/components/SquareButton";
import { NeonBoard } from "@/constants/Colors";
import { useDownloadedItem } from "@/hooks/useDownloadedItem";
import { processesAtom } from "@/providers/DownloadProvider";
import { queueAtom } from "@/utils/atoms/queue";

/** The sheet and its option queries exist only for the row that was tapped. */
export const EpisodeDownloadButton = memo(function EpisodeDownloadButton({
  item,
  onOpen,
}: {
  item: BaseItemDto;
  onOpen: (item: BaseItemDto) => void;
}) {
  const { t } = useTranslation();
  const progressAtom = useMemo(
    () =>
      atom((get) => get(processesAtom).find((job) => job.item?.Id === item.Id)),
    [item.Id],
  );
  const queuedAtom = useMemo(
    () => atom((get) => get(queueAtom).some((job) => job.item.Id === item.Id)),
    [item.Id],
  );
  const job = useAtomValue(progressAtom);
  const queued = useAtomValue(queuedAtom);
  const downloaded = useDownloadedItem(item.Id);
  return (
    <SquareButton
      accessibilityRole='button'
      accessibilityLabel={t("item.download")}
      onPress={() => onOpen(item)}
    >
      {job ? (
        job.progress ? (
          <View style={{ transform: [{ rotate: "-45deg" }] }}>
            <ProgressCircle
              size={Math.round(HEADER_ICON_SIZE * 0.79)}
              fill={job.progress}
              width={2.5}
              tintColor={NeonBoard.green}
              backgroundColor={NeonBoard.line2}
            />
          </View>
        ) : (
          <Loader />
        )
      ) : (
        <HeaderIcon
          name={queued ? "queued" : downloaded ? "downloaded" : "downloads"}
          tintColor={downloaded ? NeonBoard.green : undefined}
        />
      )}
    </SquareButton>
  );
});
