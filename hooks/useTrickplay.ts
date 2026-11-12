import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useGlobalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prefetchServerImage } from "@/components/common/ServerImage";
import { useDownloadActions } from "@/providers/DownloadProvider";
import { apiAtom } from "@/providers/JellyfinProvider";
import { ticksToMs } from "@/utils/time";
import {
  generateTrickplayUrl,
  getTrickplayInfo,
  type TrickplayInfo,
} from "@/utils/trickplay";
import {
  TrickplayPrefetchQueue,
  trickplaySheetWindow,
} from "@/utils/trickplayPrefetch";

interface TrickplayUrl {
  x: number;
  y: number;
  url: string;
}

/** Hook to handle trickplay logic for a given item. */
export const useTrickplay = (item: BaseItemDto, prefetchEnabled = true) => {
  const api = useAtomValue(apiAtom);
  const { getDownloadedItemById } = useDownloadActions();
  const [trickPlayUrl, setTrickPlayUrl] = useState<TrickplayUrl | null>(null);
  const lastCalculationTime = useRef(0);
  const throttleDelay = 200;
  const isOffline = useGlobalSearchParams().offline === "true";
  const trickplayInfo = useMemo(() => getTrickplayInfo(item), [item]);

  const prefetchQueue = useMemo(
    () =>
      new TrickplayPrefetchQueue((url) =>
        prefetchServerImage(url, api?.basePath),
      ),
    [api?.basePath, item.Id, isOffline],
  );
  useEffect(() => () => prefetchQueue.dispose(), [prefetchQueue]);

  /** Generates the trickplay URL for the given item and sheet index.
   * We change between offline and online trickplay URLs depending on the state of the app. */
  const getTrickplayUrl = useCallback(
    (item: BaseItemDto, sheetIndex: number) => {
      // If we are offline, we can use the downloaded item's trickplay data path
      const downloadedItem = getDownloadedItemById(item.Id!);
      if (isOffline && downloadedItem?.trickPlayData?.path) {
        return `${downloadedItem.trickPlayData.path}${sheetIndex}.jpg`;
      }
      return generateTrickplayUrl(item, sheetIndex);
    },
    [trickplayInfo, isOffline, getDownloadedItemById],
  );

  /** Calculates the trickplay URL for the current progress. */
  const calculateTrickplayUrl = useCallback(
    (progress: number) => {
      const now = Date.now();
      if (
        !trickplayInfo ||
        !item.Id ||
        now - lastCalculationTime.current < throttleDelay
      )
        return;
      lastCalculationTime.current = now;
      const { sheetIndex, x, y } = calculateTrickplayTile(
        progress,
        trickplayInfo,
      );
      const url = getTrickplayUrl(item, sheetIndex);
      if (url) setTrickPlayUrl({ x, y, url });
      if (prefetchEnabled) {
        const urls = trickplaySheetWindow(
          sheetIndex,
          trickplayInfo.totalImageSheets,
        )
          .map((index) => getTrickplayUrl(item, index))
          .filter((value): value is string => !!value);
        prefetchQueue.replace(urls);
      }
    },
    [
      trickplayInfo,
      item,
      throttleDelay,
      getTrickplayUrl,
      prefetchEnabled,
      prefetchQueue,
    ],
  );

  /** Legacy TV caller. Phone controls prefetch only the current scrub window. */
  const prefetchAllTrickplayImages = useCallback(async () => {
    if (!trickplayInfo || !item.Id) return;
    const maxConcurrent = 4;
    const total = trickplayInfo.totalImageSheets;
    const urls: string[] = [];
    for (let index = 0; index < total; index++) {
      const url = getTrickplayUrl(item, index);
      if (url) urls.push(url);
    }
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      await Promise.all(
        batch.map(
          (url) => prefetchServerImage(url, api?.basePath).catch(() => {}), // Ignore errors
        ),
      );
      // Yield to the event loop between batches to avoid blocking
      await Promise.resolve();
    }
  }, [trickplayInfo, item, getTrickplayUrl, api?.basePath]);

  return {
    trickPlayUrl,
    calculateTrickplayUrl,
    prefetchAllTrickplayImages,
    trickplayInfo,
  };
};

export interface TrickplayData {
  Interval?: number;
  TileWidth?: number;
  TileHeight?: number;
  Height?: number;
  Width?: number;
  ThumbnailCount?: number;
}

/**
 * Calculates the specific image sheet and tile offset for a given time.
 * @param progressTicks The current playback time in ticks.
 * @param trickplayInfo The parsed trickplay information object.
 * @returns An object with the image sheet index, and the X/Y coordinates for the tile.
 */
const calculateTrickplayTile = (
  progressTicks: number,
  trickplayInfo: TrickplayInfo,
) => {
  const { data } = trickplayInfo;
  const { Interval, TileWidth, TileHeight } = data;

  if (!Interval || !TileWidth || !TileHeight) {
    throw new Error("Invalid trickplay data provided to calculateTile");
  }

  const currentTimeMs = Math.max(0, ticksToMs(progressTicks));
  const currentTile = Math.floor(currentTimeMs / Interval);

  const tilesPerSheet = TileWidth * TileHeight;
  const sheetIndex = Math.floor(currentTile / tilesPerSheet);
  const tileIndexInSheet = currentTile % tilesPerSheet;

  const x = tileIndexInSheet % TileWidth;
  const y = Math.floor(tileIndexInSheet / TileWidth);

  return { sheetIndex, x, y };
};
