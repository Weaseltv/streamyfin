import { useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "expo-router";
import { useAtomValue } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AppState } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { playbackRefreshQueue } from "@/utils/query/playbackRefresh";

export const HomeRowResetContext = createContext<{
  scope: string;
  revision: number;
  visible: boolean;
  resetRows: () => void;
} | null>(null);

/** Mounted only around phone Home, never around Library or a TV screen. */
export function HomeRowResetProvider({ children }: { children: ReactNode }) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const focused = useIsFocused();
  const queue = playbackRefreshQueue(useQueryClient());
  const subscribe = useCallback(
    (listener: () => void) => queue.subscribeHold(listener),
    [queue],
  );
  const snapshot = useCallback(() => queue.isHeld, [queue]);
  const held = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background" &&
      AppState.currentState !== "inactive",
  );
  const [revision, setRevision] = useState(0);
  const resetRows = useCallback(() => setRevision((value) => value + 1), []);
  const scope = JSON.stringify([api?.basePath ?? "", user?.Id ?? ""]);
  const visible = focused && foreground && !held;

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (visible) resetRows();
  }, [visible, scope, resetRows]);
  const value = useMemo(
    () => ({ scope, revision, visible, resetRows }),
    [scope, revision, visible, resetRows],
  );
  return (
    <HomeRowResetContext.Provider value={value}>
      {children}
    </HomeRowResetContext.Provider>
  );
}

const noop = () => {};
export function useResetHomeRows() {
  return useContext(HomeRowResetContext)?.resetRows ?? noop;
}
