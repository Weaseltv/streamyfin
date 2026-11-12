import { useEffect } from "react";
import { Platform } from "react-native";
import { writeInfoLog } from "@/utils/log";
import {
  createNavTiming,
  type NavTimingKind,
  type NavTimingStage,
} from "@/utils/navTimingCore";

const timing = createNavTiming({
  now: () => performance.now(),
  emit: (line) => {
    // The app's own log (Settings, Logs), and the device log where one exists
    writeInfoLog(line);
    console.log(line);
  },
});

const KIND_BY_PATHNAME: Record<string, NavTimingKind> = {
  "/series/[id]": "series",
  "/items/page": "item",
  "/collections/[collectionId]": "collection",
  "/[libraryId]": "library",
};

/** Start timing the page a card tap is about to open. Phones only. */
export function markNavTap(navigation: {
  pathname: string;
  params?: Record<string, string | undefined>;
}) {
  if (Platform.isTV) return;
  const kind = KIND_BY_PATHNAME[navigation.pathname];
  const params = navigation.params;
  const id =
    params?.id ?? params?.collectionId ?? params?.libraryId ?? undefined;
  if (!kind || !id) return;
  timing.tap(kind, id);
}

/**
 * Report that a page reached a stage, once `reached` is true. Runs after the
 * commit that drew it, so the time includes React's work for that draw.
 */
export function useNavTimingStage(
  kind: NavTimingKind,
  id: string | undefined,
  stage: NavTimingStage,
  reached: boolean,
) {
  useEffect(() => {
    if (!reached || !id || Platform.isTV) return;
    timing.stage(kind, id, stage);
  }, [kind, id, stage, reached]);
}
