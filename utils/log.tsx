import { useQuery } from "@tanstack/react-query";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";
import { createBatchedLogStore } from "./batchedLogStore";
import { storage } from "./mmkv";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
}

const mmkvStorage = createJSONStorage(() => ({
  getItem: (key: string) => storage.getString(key) || null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.remove(key),
}));
const logsAtom = atomWithStorage("logs", [], mmkvStorage);

const LogContext = createContext<ReturnType<typeof useLogProvider> | null>(
  null,
);
const _DownloadContext = createContext<ReturnType<
  typeof useLogProvider
> | null>(null);

function useLogProvider() {
  // LogProvider is mounted at the root but the only consumer is the diagnostics
  // screen, so this used to read and JSON.parse the log store once a second for
  // the entire life of the app. Poll only while something is actually reading.
  const [subscriberCount, setSubscriberCount] = useState(0);

  const subscribe = useCallback(() => {
    setSubscriberCount((count) => count + 1);
    return () => setSubscriberCount((count) => Math.max(0, count - 1));
  }, []);

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: async () => readFromLog(),
    refetchInterval: 1000,
    enabled: subscriberCount > 0,
  });

  return useMemo(() => ({ logs, subscribe }), [logs, subscribe]);
}

const logStore = createBatchedLogStore<LogEntry>({
  read: () => storage.getString("logs"),
  write: (value) => storage.set("logs", value),
});

export const writeToLog = (level: LogLevel, message: string, data?: any) => {
  const newEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    data: data,
  };

  try {
    logStore.append(newEntry, level === "ERROR");
  } catch {
    // Some native/API errors carry circular data. Preserve the error message
    // and its urgency without allowing that payload to block the whole ring.
    logStore.append(
      { ...newEntry, data: "[Unserializable log data]" },
      level === "ERROR",
    );
  }
};

export const writeInfoLog = (message: string, data?: any) =>
  writeToLog("INFO", message, data);
export const writeErrorLog = (message: string, data?: any) =>
  writeToLog("ERROR", message, data);
export const writeDebugLog = (message: string, data?: any) => {
  if (process.env.EXPO_PUBLIC_WRITE_DEBUG === "1") {
    writeToLog("DEBUG", message, data);
  }
};

export const readFromLog = (): LogEntry[] => logStore.read();

export function useLog() {
  const context = useContext(LogContext);
  if (context === null) {
    throw new Error("useLog must be used within a LogProvider");
  }
  // `subscribe` is stable, so this registers once per consumer rather than
  // re-running every time fresh logs arrive.
  const { subscribe } = context;
  useEffect(() => subscribe(), [subscribe]);
  return context;
}

export function LogProvider({ children }: { children: React.ReactNode }) {
  const provider = useLogProvider();
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") logStore.flush();
    });
    return () => {
      subscription.remove();
      logStore.flush();
    };
  }, []);

  return <LogContext.Provider value={provider}>{children}</LogContext.Provider>;
}

export default logsAtom;
