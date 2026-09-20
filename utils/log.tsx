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

export const writeToLog = (level: LogLevel, message: string, data?: any) => {
  const newEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level,
    message: message,
    data: data,
  };

  const currentLogs = storage.getString("logs");
  const logs: LogEntry[] = currentLogs ? JSON.parse(currentLogs) : [];
  logs.push(newEntry);

  const maxLogs = 100;
  const recentLogs = logs.slice(Math.max(logs.length - maxLogs, 0));

  storage.set("logs", JSON.stringify(recentLogs));
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

export const readFromLog = (): LogEntry[] => {
  const logs = storage.getString("logs");
  return logs ? JSON.parse(logs) : [];
};

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

  return <LogContext.Provider value={provider}>{children}</LogContext.Provider>;
}

export default logsAtom;
