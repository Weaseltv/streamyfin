import * as Application from "expo-application";
import { Directory, Paths } from "expo-file-system";
import { atom, useAtom } from "jotai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { Platform } from "react-native";
import { useHaptic } from "@/hooks/useHaptic";
import { useSettings } from "@/utils/atoms/settings";
import {
  getAllDownloadedItems,
  getDownloadedItemById,
  getDownloadsDatabase,
  updateDownloadedItem,
} from "./Downloads/database";
import { getDownloadedItemSize } from "./Downloads/fileOperations";
import { useDownloadEventHandlers } from "./Downloads/hooks/useDownloadEventHandlers";
import { useDownloadOperations } from "./Downloads/hooks/useDownloadOperations";
import { useDownloadReconciliation } from "./Downloads/hooks/useDownloadReconciliation";
import { setDownloadLiveActivityEnabled } from "./Downloads/liveActivity";
import type { JobStatus } from "./Downloads/types";
import { apiAtom } from "./JellyfinProvider";

export const processesAtom = atom<JobStatus[]>([]);
export const downloadingAtom = atom((get) =>
  get(processesAtom).some((process) =>
    ["downloading", "queued", "pending"].includes(process.status),
  ),
);
const APP_CACHE_DOWNLOAD_DIRECTORY = new Directory(
  Paths.cache,
  `${Application.applicationId}/Downloads/`,
);

export const downloadsRefreshAtom = atom<number>(0);

const DownloadContext = createContext<ReturnType<
  typeof useDownloadProvider
> | null>(null);

function useDownloadProvider() {
  const [api] = useAtom(apiAtom);
  const [processes, setProcesses] = useAtom<JobStatus[]>(processesAtom);
  const [refreshKey, setRefreshKey] = useAtom(downloadsRefreshAtom);
  const successHapticFeedback = useHaptic("success");
  const { settings } = useSettings();

  // Native owns the Live Activity, so the preference has to be pushed across rather than read at
  // the point of use — the URLSession delegate runs when JS does not.
  const liveActivityEnabled = settings?.showDownloadLiveActivity ?? true;
  useEffect(() => {
    setDownloadLiveActivityEnabled(liveActivityEnabled);
  }, [liveActivityEnabled]);

  // Reactive downloaded items that updates when refreshKey changes
  const downloadedItems = useMemo(() => {
    return getAllDownloadedItems();
  }, [refreshKey]);

  // Trigger refresh of download lists
  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, [setRefreshKey]);

  const authHeader = useMemo(() => {
    return api?.accessToken;
  }, [api]);

  const updateProcess = useCallback(
    (
      processId: string,
      updater:
        | Partial<JobStatus>
        | ((current: JobStatus) => Partial<JobStatus>),
    ) => {
      setProcesses((prev) => {
        const processIndex = prev.findIndex((p) => p.id === processId);
        if (processIndex === -1) return prev;

        const currentProcess = prev[processIndex];
        if (!currentProcess) return prev;

        const newStatus =
          typeof updater === "function" ? updater(currentProcess) : updater;

        // Create new array with updated process
        const newProcesses = [...prev];
        newProcesses[processIndex] = {
          ...currentProcess,
          ...newStatus,
        };

        return newProcesses;
      });
    },
    [setProcesses],
  );

  const removeProcess = useCallback(
    (id: string) => {
      // Use setTimeout to defer removal and avoid race conditions during rendering
      setTimeout(() => {
        setProcesses((prev) => prev.filter((process) => process.id !== id));
      }, 0);
    },
    [setProcesses],
  );

  // Set up download event handlers
  useDownloadEventHandlers({
    processes,
    updateProcess,
    removeProcess,
    onSuccess: successHapticFeedback,
    onDataChange: triggerRefresh,
  });

  // Settle downloads left over from a previous app session (finished while JS was dead,
  // still transferring natively, or queued and lost with the process).
  useDownloadReconciliation({
    setProcesses,
    onDataChange: triggerRefresh,
  });

  // Get download operation functions
  const {
    startBackgroundDownload,
    cancelDownload,
    deleteFile,
    deleteItems,
    deleteAllFiles,
    deleteFileByType,
    appSizeUsage,
  } = useDownloadOperations({
    processes,
    setProcesses,
    removeProcess,
    api,
    authHeader,
    onDataChange: triggerRefresh,
  });

  return {
    processes,
    startBackgroundDownload,
    downloadedItems, // Reactive value that auto-updates
    getDownloadedItems: getAllDownloadedItems, // Keep for backward compatibility
    getDownloadsDatabase,
    deleteAllFiles,
    deleteFile,
    deleteItems,
    deleteFileByType,
    removeProcess,
    cancelDownload,
    getDownloadedItemSize,
    getDownloadedItemById,
    updateDownloadedItem,
    triggerRefresh,
    APP_CACHE_DOWNLOAD_DIRECTORY: APP_CACHE_DOWNLOAD_DIRECTORY.uri,
    appSizeUsage,
    // Deprecated/not implemented in simple version
    startDownload: async () => {},
    cleanCacheDirectory: async () => {},
    dumpDownloadDiagnostics: async () => "",
  };
}

const TV_DOWNLOADS = {
  processes: [],
  startBackgroundDownload: async () => {},
  downloadedItems: [],
  getDownloadedItems: () => [],
  getDownloadsDatabase: () => ({ movies: {}, series: {}, other: {} }),
  deleteAllFiles: async () => {},
  deleteFile: async () => {},
  deleteItems: async () => {},
  deleteFileByType: async () => {},
  removeProcess: () => {},
  cancelDownload: async () => {},
  triggerRefresh: () => {},
  startDownload: async () => {},
  getDownloadedItemSize: () => 0,
  getDownloadedItemById: () => undefined,
  updateDownloadedItem: () => {},
  APP_CACHE_DOWNLOAD_DIRECTORY: "",
  cleanCacheDirectory: async () => {},
  appSizeUsage: async () => ({ total: 0, remaining: 0, appSize: 0 }),
  dumpDownloadDiagnostics: async () => "",
};

type DownloadActions = Omit<
  ReturnType<typeof useDownloadProvider>,
  "processes" | "downloadedItems"
>;
const DownloadActionsContext = createContext<DownloadActions | null>(null);
export function useDownloadActions() {
  const context = useContext(DownloadActionsContext);
  if (Platform.isTV) return TV_DOWNLOADS;
  if (!context)
    throw new Error(
      "useDownloadActions must be used within a DownloadProvider",
    );
  return context;
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (Platform.isTV) return TV_DOWNLOADS;
  if (context === null) {
    throw new Error("useDownload must be used within a DownloadProvider");
  }

  return context;
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const downloadUtils = useDownloadProvider();
  const latest = useRef(downloadUtils);
  useLayoutEffect(() => {
    latest.current = downloadUtils;
  }, [downloadUtils]);
  // Stable callable wrappers read the latest committed closures (including auth
  // and process state). Changing progress never changes this context value.
  const actions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(downloadUtils)
          .filter(([key]) => key !== "processes" && key !== "downloadedItems")
          .map(([key, value]) => [
            key,
            typeof value === "function"
              ? (...args: unknown[]) => {
                  const current =
                    latest.current[key as keyof typeof downloadUtils];
                  return (current as (...values: unknown[]) => unknown)(
                    ...args,
                  );
                }
              : value,
          ]),
      ) as DownloadActions,
    [downloadUtils.APP_CACHE_DOWNLOAD_DIRECTORY],
  );

  return (
    <DownloadActionsContext.Provider value={actions}>
      <DownloadContext.Provider value={downloadUtils}>
        {children}
      </DownloadContext.Provider>
    </DownloadActionsContext.Provider>
  );
}
