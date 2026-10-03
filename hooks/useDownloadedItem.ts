import { atom, useAtomValue } from "jotai";
import { useMemo } from "react";
import { Platform } from "react-native";
import { downloadsRefreshAtom } from "@/providers/DownloadProvider";
import { getDownloadedItemById } from "@/providers/Downloads/database";

/** Progress events do not change completed-download status. */
export const useDownloadedItem = (id?: string | null): boolean => {
  const selected = useMemo(
    () =>
      atom((get) => {
        get(downloadsRefreshAtom);
        return !Platform.isTV && !!id && !!getDownloadedItemById(id);
      }),
    [id],
  );
  return useAtomValue(selected);
};
