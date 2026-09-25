import { t } from "i18next";
import { View, type ViewProps } from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { NeonBoard } from "@/constants/Colors";
import { useDownload } from "@/providers/DownloadProvider";
import { JobStatus } from "@/providers/Downloads/types";
import { DownloadCard } from "./DownloadCard";

interface ActiveDownloadsProps extends ViewProps {}

/**
 * The "Active download" and "Queue" sections at the top of Downloads. Each
 * renders only when it has rows; with nothing in flight this is empty.
 */
export default function ActiveDownloads({ ...props }: ActiveDownloadsProps) {
  const { processes } = useDownload();

  // Filter out any invalid processes before rendering
  const validProcesses = processes?.filter((p) => p?.item?.Id) || [];
  const active = validProcesses.filter(
    (p: JobStatus) => p.status !== "queued" && p.status !== "pending",
  );
  const queued = validProcesses.filter(
    (p: JobStatus) => p.status === "queued" || p.status === "pending",
  );

  if (validProcesses.length === 0) return null;

  return (
    <View {...props}>
      {active.length > 0 && (
        <View>
          <SectionHeader
            title={t("home.downloads.active_download")}
            accent={NeonBoard.volt}
            count={active.length}
            className='px-4'
            bleedRule
          />
          {active.map((p: JobStatus) => (
            <DownloadCard key={p.id} process={p} />
          ))}
        </View>
      )}
      {queued.length > 0 && (
        <View>
          <SectionHeader
            title={t("home.downloads.queue")}
            accent={NeonBoard.volt}
            count={queued.length}
            className='px-4'
            bleedRule
          />
          {queued.map((p: JobStatus) => (
            <DownloadCard key={p.id} process={p} />
          ))}
        </View>
      )}
    </View>
  );
}
