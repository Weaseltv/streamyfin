import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Directory, File, Paths } from "expo-file-system";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import DeviceInfo from "react-native-device-info";
import { toast } from "sonner-native";
import type { Bitrate } from "@/components/BitrateSelector";
import { BackgroundDownloader } from "@/modules";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { getOrSetDeviceId } from "@/utils/device";
import { estimateDownloadSize } from "@/utils/download";
import { writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  cleanupPreparedFiles,
  downloadAdditionalAssets,
} from "../additionalDownloads";
import {
  clearAllDownloadedItems,
  getAllDownloadedItems,
  removeDownloadedItem,
} from "../database";
import {
  calculateTotalDownloadedSize,
  deleteAllAssociatedFiles,
} from "../fileOperations";
import { buildDownloadActivityMetadata } from "../liveActivity";
import {
  cleanupPendingRecordFiles,
  getPendingDownload,
  removePendingDownload,
  savePendingDownload,
  updatePendingDownload,
} from "../pendingDownloads";
import {
  downloadPreparationQueue,
  downloadPreparations,
  type PreparationStage,
  preparationStage,
} from "../preparation";
import type { JobStatus } from "../types";
import { generateFilename, uriToFilePath } from "../utils";

interface UseDownloadOperationsProps {
  processes: JobStatus[];
  setProcesses: (updater: (prev: JobStatus[]) => JobStatus[]) => void;
  removeProcess: (id: string) => void;
  api: any;
  authHeader?: string;
  onDataChange?: () => void;
}

/**
 * Hook providing download operation functions (start, cancel, delete)
 */
export function useDownloadOperations({
  processes,
  setProcesses,
  removeProcess,
  api,
  authHeader,
  onDataChange,
}: UseDownloadOperationsProps) {
  const { t } = useTranslation();
  const sessionOwner = `${api?.basePath ?? ""}:${authHeader ?? ""}`;
  const currentOwner = useRef(sessionOwner);
  currentOwner.current = sessionOwner;
  const currentProcesses = useRef(processes);
  currentProcesses.current = processes;
  useLayoutEffect(
    () => () => downloadPreparations.cancelOwner(sessionOwner),
    [sessionOwner],
  );

  const startBackgroundDownload = useCallback(
    async (
      input:
        | string
        | ((stage: PreparationStage) => Promise<{
            url: string;
            item: BaseItemDto;
            mediaSource: MediaSourceInfo;
            audioStreamIndex?: number;
            subtitleStreamIndex?: number;
          }>),
      originalItem: BaseItemDto,
      originalMediaSource: MediaSourceInfo | undefined,
      maxBitrate: Bitrate,
      initialAudioIndex?: number,
      initialSubtitleIndex?: number,
    ) => {
      if (!api || !originalItem.Id || !authHeader)
        throw new Error("download_parameters_missing");
      if (currentOwner.current !== sessionOwner) return;
      const itemId = originalItem.Id;
      const previousAttempt = getPendingDownload(itemId);
      if (
        (previousAttempt && previousAttempt.status !== "failed") ||
        currentProcesses.current.some(
          (p) =>
            p.id === itemId &&
            ["pending", "queued", "downloading"].includes(p.status),
        )
      ) {
        toast.info(
          t("home.downloads.toasts.item_already_downloading", {
            item: originalItem.Name,
          }),
        );
        return;
      }
      const operation = downloadPreparations.reserve(itemId, sessionOwner);
      if (!operation) {
        toast.info(
          t("home.downloads.toasts.item_already_downloading", {
            item: originalItem.Name,
          }),
        );
        return;
      }
      const nativeItemId = `${itemId}:${operation.generation}`;
      const assertCurrent = () => {
        operation.assertActive();
        if (currentOwner.current !== sessionOwner) {
          operation.cancel();
          operation.assertActive();
        }
      };
      const updateOwn = (patch: Partial<JobStatus>) =>
        setProcesses((previous) =>
          previous.map((p) =>
            p.nativeItemId === nativeItemId ? { ...p, ...patch } : p,
          ),
        );
      const removeOwn = () =>
        setProcesses((previous) =>
          previous.filter((p) => p.nativeItemId !== nativeItemId),
        );
      const clearOwnRecord = () => {
        if (
          getPendingDownload(itemId)?.activityMetadata?.itemId === nativeItemId
        )
          removePendingDownload(itemId);
      };
      let assets:
        | Awaited<ReturnType<typeof downloadAdditionalAssets>>
        | undefined;
      let videoFile: File | undefined;
      let activityMetadata: Awaited<
        ReturnType<typeof buildDownloadActivityMetadata>
      >;
      let downloadUrl: string | undefined;
      let taskId: number | undefined;
      let accepted = false;
      let retainedFailure = false;
      let releasePreparation: (() => void) | undefined;
      const deviceId = getOrSetDeviceId();
      setProcesses((previous) => [
        ...previous.filter((p) => p.id !== itemId),
        {
          id: itemId,
          itemId,
          nativeItemId,
          inputUrl: "",
          item: originalItem,
          deviceId,
          progress: 0,
          status: "pending",
          timestamp: new Date(),
          mediaSource: originalMediaSource ?? {},
          maxBitrate,
          bytesDownloaded: 0,
        },
      ]);
      writeInfoLog("Download preparation", {
        stage: "accepted",
        generation: operation.generation,
      });
      try {
        releasePreparation = await downloadPreparationQueue.acquire(
          operation.signal,
        );
        assertCurrent();
        // Check document write permission independently from optional network assets.
        const probe = new File(
          Paths.document,
          `download-${operation.generation}.probe`,
        );
        try {
          probe.write("ready");
        } finally {
          if (probe.exists) probe.delete();
        }
        const resolved =
          typeof input === "function"
            ? await preparationStage(operation, input, 65_000)
            : {
                url: input,
                item: originalItem,
                mediaSource: originalMediaSource,
                audioStreamIndex: initialAudioIndex,
                subtitleStreamIndex: initialSubtitleIndex,
              };
        assertCurrent();
        if (!resolved.url || !resolved.mediaSource)
          throw new Error("download_stream_unavailable");
        const { item, mediaSource } = resolved;
        const audioStreamIndex = resolved.audioStreamIndex;
        const subtitleStreamIndex = resolved.subtitleStreamIndex;
        downloadUrl = resolved.url.startsWith("/")
          ? `${api.basePath}${resolved.url}`
          : resolved.url;
        writeInfoLog("Download preparation", {
          stage: "stream_ready",
          generation: operation.generation,
          result: mediaSource.TranscodingUrl ? "transcode" : "direct",
        });
        assets = await downloadAdditionalAssets({
          item,
          mediaSource,
          api,
          operation,
          selectedSubtitleIndex: subtitleStreamIndex,
        });
        assertCurrent();
        const resumeKey = JSON.stringify([
          api.basePath,
          itemId,
          mediaSource.Id,
          maxBitrate.value,
          audioStreamIndex ?? -1,
          subtitleStreamIndex ?? -1,
          !!mediaSource.TranscodingUrl,
        ]);
        const resume =
          previousAttempt?.resumeKey === resumeKey &&
          !mediaSource.TranscodingUrl;
        const videoFileName = resume
          ? previousAttempt.videoFileName
          : `${generateFilename(item)}_${operation.generation}.mp4`;
        if (previousAttempt) cleanupPendingRecordFiles(previousAttempt, resume);
        videoFile = new File(Paths.document, videoFileName);
        try {
          activityMetadata = await preparationStage(
            operation,
            (stage) =>
              buildDownloadActivityMetadata({
                item,
                api,
                t,
                stage,
                generation: operation.generation,
                estimatedTotalBytes: maxBitrate.value
                  ? estimateDownloadSize(maxBitrate.value, item.RunTimeTicks)
                  : undefined,
              }),
            15_000,
            60_000,
          );
        } catch {
          assertCurrent();
        }
        activityMetadata = {
          ...(activityMetadata ?? {
            title: item.Name ?? "",
            subtitle: "",
            labels: {},
          }),
          itemId: nativeItemId,
        };
        assertCurrent();
        updateOwn({
          item,
          inputUrl: downloadUrl,
          status: "queued",
          mediaSource: assets.updatedMediaSource,
          trickPlayData: assets.trickPlayData,
          introSegments: assets.introSegments,
          creditSegments: assets.creditSegments,
          audioStreamIndex,
          subtitleStreamIndex,
        });
        savePendingDownload({
          itemId,
          status: "queued",
          enqueuedAt: new Date().toISOString(),
          inputUrl: downloadUrl,
          videoFileName,
          resumeKey,
          item,
          mediaSource: assets.updatedMediaSource,
          maxBitrate,
          deviceId,
          trickPlayData: assets.trickPlayData,
          introSegments: assets.introSegments,
          creditSegments: assets.creditSegments,
          audioStreamIndex,
          subtitleStreamIndex,
          activityMetadata,
        });
        writeInfoLog("Download preparation", {
          stage: "native_enqueue",
          generation: operation.generation,
        });
        taskId = await BackgroundDownloader.enqueueDownload(
          downloadUrl,
          uriToFilePath(videoFile.uri),
          activityMetadata,
          getJellyfinHeadersForUrl(downloadUrl, api.basePath),
        );
        assertCurrent();
        if (taskId < -1) throw new Error("download_native_handoff_failed");
        accepted = true;
        if (taskId !== -1) updatePendingDownload(itemId, { taskId });
        // Native's started event alone owns the transition to actively downloading.
        for (const image of assets.images) storage.set(image.key, image.base64);
        writeInfoLog("Download preparation", {
          stage: "native_accepted",
          generation: operation.generation,
          result: taskId === -1 ? "queued" : "enqueued",
        });
        if (
          getPendingDownload(itemId)?.activityMetadata?.itemId ===
            nativeItemId &&
          getPendingDownload(itemId)?.status === "queued"
        )
          toast.info(t("home.downloads.live_activity.queued"));
      } catch (error) {
        const cancelled =
          (operation.signal.aborted &&
            operation.reason instanceof Error &&
            operation.reason.message === "download_preparation_cancelled") ||
          currentOwner.current !== sessionOwner;
        operation.cancel();
        if (taskId !== undefined && taskId >= 0)
          BackgroundDownloader.cancelDownload(taskId);
        if (downloadUrl) BackgroundDownloader.cancelQueuedDownload(downloadUrl);
        const ownRecord = getPendingDownload(itemId);
        if (
          ownRecord?.activityMetadata?.itemId === nativeItemId &&
          !cancelled
        ) {
          cleanupPendingRecordFiles(ownRecord, true);
          updatePendingDownload(itemId, { status: "failed" });
          retainedFailure = true;
        } else {
          if (ownRecord?.activityMetadata?.itemId === nativeItemId)
            cleanupPendingRecordFiles(ownRecord);
          clearOwnRecord();
        }
        cleanupPreparedFiles([
          ...(assets?.ownedFiles ?? []),
          ...(videoFile && !retainedFailure ? [videoFile] : []),
        ]);
        if (activityMetadata?.posterFileName) {
          const directory = BackgroundDownloader.getLiveActivityDirectory();
          if (directory)
            cleanupPreparedFiles([
              new File(
                new Directory(`file://${directory}`),
                activityMetadata.posterFileName,
              ),
            ]);
        }
        if (cancelled) {
          const prior = getPendingDownload(itemId);
          if (
            prior?.status === "failed" &&
            prior.activityMetadata?.itemId !== nativeItemId
          ) {
            updateOwn({
              nativeItemId: prior.activityMetadata?.itemId,
              status: "error",
              inputUrl: prior.inputUrl,
              item: prior.item,
              mediaSource: prior.mediaSource,
              maxBitrate: prior.maxBitrate,
              trickPlayData: prior.trickPlayData,
              audioStreamIndex: prior.audioStreamIndex,
              subtitleStreamIndex: prior.subtitleStreamIndex,
            });
          } else removeOwn();
        } else {
          const message =
            error instanceof Error &&
            error.message === "download_selected_subtitle_unavailable"
              ? t("home.downloads.selected_subtitle_unavailable")
              : t("home.downloads.toasts.failed_to_start_download");
          updateOwn({ status: "error", errorMessage: message });
          toast.error(message);
        }
        writeInfoLog("Download preparation", {
          stage: "finished",
          generation: operation.generation,
          result: cancelled ? "cancelled" : "failed",
        });
      } finally {
        releasePreparation?.();
        downloadPreparations.release(operation);
        if (!accepted && !retainedFailure) clearOwnRecord();
      }
    },
    [api, authHeader, sessionOwner, setProcesses, t],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      downloadPreparations.cancel(id);
      const record = getPendingDownload(id);

      if (record?.status === "downloading" && record.taskId !== undefined) {
        // Cancel active download by taskId
        BackgroundDownloader.cancelDownload(record.taskId);
      } else if (record) {
        // Still queued natively — cancel by URL
        BackgroundDownloader.cancelQueuedDownload(record.inputUrl);
      }

      if (record) cleanupPendingRecordFiles(record);
      const process = currentProcesses.current.find((p) => p.id === id);
      const failed = process
        ? process.status === "error"
        : record?.status === "failed";
      removePendingDownload(id);
      removeProcess(id);
      if (!failed) toast.info(t("home.downloads.toasts.download_cancelled"));
    },
    [removeProcess, t],
  );

  const deleteFile = useCallback(
    async (id: string) => {
      const itemToDelete = removeDownloadedItem(id);

      if (itemToDelete) {
        try {
          deleteAllAssociatedFiles(itemToDelete);
          toast.success(
            t("home.downloads.toasts.file_deleted", {
              item: itemToDelete.item.Name,
            }),
          );
          onDataChange?.();
        } catch (error) {
          console.error("Failed to delete files:", error);
        }
      }
    },
    [t, onDataChange],
  );

  const deleteItems = useCallback(
    async (ids: string[]) => {
      for (const id of ids) {
        await deleteFile(id);
      }
    },
    [deleteFile],
  );

  const deleteAllFiles = useCallback(async () => {
    const allItems = getAllDownloadedItems();

    for (const item of allItems) {
      try {
        deleteAllAssociatedFiles(item);
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    }

    clearAllDownloadedItems();
    toast.success(t("home.downloads.toasts.all_files_deleted"));
    onDataChange?.();
  }, [t, onDataChange]);

  const deleteFileByType = useCallback(
    async (itemType: string) => {
      const allItems = getAllDownloadedItems();
      const itemsToDelete = allItems.filter(
        (item) => item.item.Type === itemType,
      );

      if (itemsToDelete.length === 0) {
        console.log(`[DELETE] No items found with type: ${itemType}`);
        return;
      }

      console.log(
        `[DELETE] Deleting ${itemsToDelete.length} items of type: ${itemType}`,
      );

      for (const item of itemsToDelete) {
        try {
          deleteAllAssociatedFiles(item);
          removeDownloadedItem(item.item.Id || "");
        } catch (error) {
          console.error(
            `Failed to delete ${itemType} file ${item.item.Name}:`,
            error,
          );
        }
      }

      const itemLabel =
        itemType === "Movie"
          ? t("common.movies")
          : itemType === "Episode"
            ? t("common.episodes")
            : itemType;

      toast.success(
        t("home.downloads.toasts.files_deleted_by_type", {
          count: itemsToDelete.length,
          type: itemLabel,
          defaultValue: `${itemsToDelete.length} ${itemLabel} deleted`,
        }),
      );

      onDataChange?.();
    },
    [t, onDataChange],
  );

  const appSizeUsage = useCallback(async () => {
    let totalSize = calculateTotalDownloadedSize();

    // Also count in-progress downloads (they write straight to their final
    // path) so the growing file shows up as app usage instead of drifting
    // into the generic device share until completion.
    for (const process of processes) {
      try {
        const file = new File(
          Paths.document,
          getPendingDownload(process.id)?.videoFileName ??
            `${generateFilename(process.item)}.mp4`,
        );
        if (file.exists) {
          totalSize += file.size ?? 0;
        }
      } catch {
        // File not created yet — ignore.
      }
    }

    try {
      const [freeDiskStorage, totalDiskCapacity] = await Promise.all([
        DeviceInfo.getFreeDiskStorage(),
        DeviceInfo.getTotalDiskCapacity(),
      ]);

      return {
        total: totalDiskCapacity,
        remaining: freeDiskStorage,
        appSize: totalSize,
      };
    } catch (error) {
      console.error("Failed to get disk storage info:", error);
      return {
        total: 0,
        remaining: 0,
        appSize: totalSize,
      };
    }
  }, [processes]);

  return {
    startBackgroundDownload,
    cancelDownload,
    deleteFile,
    deleteItems,
    deleteAllFiles,
    deleteFileByType,
    appSizeUsage,
  };
}
