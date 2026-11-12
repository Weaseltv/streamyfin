import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Directory, File, Paths } from "expo-file-system";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { getItemImage } from "@/utils/getItemImage";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { fetchAndParseSegments } from "@/utils/segments";
import { generateTrickplayUrl, getTrickplayInfo } from "@/utils/trickplay";
import { downloadPreparationFile } from "./assetDownload";
import {
  cloneDownloadMedia,
  type DownloadPreparation,
  type PreparationStage,
  preparationStage,
} from "./preparation";
import type { TrickPlayData } from "./types";
import { generateFilename } from "./utils";

export type AssetContext = {
  prefix: string;
  owned: (File | Directory)[];
  allOwned?: (File | Directory)[];
};
function own(context: AssetContext, file: File | Directory) {
  context.owned.push(file);
  context.allOwned?.push(file);
}
export function cleanupPreparedFiles(files: (File | Directory)[]) {
  for (const file of [...files].reverse()) {
    try {
      if (file.exists) file.delete();
    } catch {
      /* Only operation-owned paths. */
    }
  }
}
function cumulativeProgress(stage: PreparationStage) {
  const bytes = new Map<string, number>();
  return (key: string): PreparationStage => ({
    ...stage,
    progress: (written) => {
      bytes.set(key, written);
      stage.progress(
        [...bytes.values()].reduce((sum, value) => sum + value, 0),
      );
    },
  });
}
export async function downloadTrickplayImages(
  item: BaseItemDto,
  apiBasePath: string,
  context: AssetContext,
  stage: PreparationStage,
): Promise<TrickPlayData | undefined> {
  const info = getTrickplayInfo(item);
  if (!info || !item.Id) return undefined;
  const directory = new Directory(
    Paths.document,
    `${context.prefix}_trickplay`,
  );
  directory.create({ intermediates: true });
  own(context, directory);
  const progressFor = cumulativeProgress(stage);
  let size = 0;
  for (let index = 0; index < info.totalImageSheets; index++) {
    stage.assertActive();
    const url = generateTrickplayUrl(item, index);
    if (!url) continue;
    const file = new File(directory, `${index}.jpg`);
    own(context, file);
    try {
      await downloadPreparationFile(
        url,
        file,
        getJellyfinHeadersForUrl(url, apiBasePath),
        progressFor(String(index)),
      );
      size += file.size;
    } catch {
      stage.assertActive();
      try {
        if (file.exists) file.delete();
      } catch {}
    }
  }
  if (!size) {
    cleanupPreparedFiles([directory]);
    return undefined;
  }
  return { path: directory.uri, size };
}
export async function downloadSubtitles(
  mediaSource: MediaSourceInfo,
  _item: BaseItemDto,
  apiBasePath: string,
  context: AssetContext,
  stage: PreparationStage,
  selectedIndex?: number,
  onlySelected = false,
): Promise<MediaSourceInfo> {
  const cloned = cloneDownloadMedia(mediaSource);
  const external =
    cloned.MediaStreams?.filter(
      (s) =>
        s.Type === "Subtitle" &&
        s.DeliveryMethod === "External" &&
        !s.DeliveryUrl?.startsWith("file:") &&
        (!onlySelected || s.Index === selectedIndex),
    ) ?? [];
  external.sort(
    (a, b) =>
      Number(b.Index === selectedIndex) - Number(a.Index === selectedIndex),
  );
  const progressFor = cumulativeProgress(stage);
  for (const subtitle of external) {
    stage.assertActive();
    const selected = subtitle.Index === selectedIndex;
    if (!subtitle.DeliveryUrl) {
      if (selected) throw new Error("download_selected_subtitle_unavailable");
      cloned.MediaStreams = cloned.MediaStreams?.filter((s) => s !== subtitle);
      continue;
    }
    const extension = (subtitle.Codec || "srt").replace(/[^a-z0-9]/gi, "");
    const file = new File(
      Paths.document,
      `${context.prefix}_subtitle_${subtitle.Index}.${extension}`,
    );
    own(context, file);
    try {
      const url = new URL(
        subtitle.DeliveryUrl,
        `${apiBasePath.replace(/\/$/, "")}/`,
      ).toString();
      await downloadPreparationFile(
        url,
        file,
        getJellyfinHeadersForUrl(url, apiBasePath),
        progressFor(String(subtitle.Index)),
      );
      stage.assertActive();
      subtitle.DeliveryUrl = file.uri;
    } catch {
      stage.assertActive();
      cleanupPreparedFiles([file]);
      if (selected) throw new Error("download_selected_subtitle_unavailable");
      // Offline menus must not advertise an optional track that never arrived.
      cloned.MediaStreams = cloned.MediaStreams?.filter((s) => s !== subtitle);
    }
  }
  return cloned;
}
export async function downloadCoverImage(
  item: BaseItemDto,
  api: Api,
  context: AssetContext,
  stage: PreparationStage,
): Promise<{ key: string; base64: string } | undefined> {
  if (!item.Id) return undefined;
  const source = getItemImage({
    item,
    api,
    variant: "Primary",
    quality: 90,
    width: 500,
  });
  if (!source?.uri) return undefined;
  const file = new File(Paths.cache, `${context.prefix}_cover.jpg`);
  own(context, file);
  await downloadPreparationFile(
    source.uri,
    file,
    getJellyfinHeadersForUrl(source.uri, api.basePath),
    stage,
  );
  const base64 = await file.base64();
  stage.assertActive();
  file.delete();
  return { key: item.Id, base64 };
}
export async function downloadSeriesImage(
  item: BaseItemDto,
  api: Api,
  context: AssetContext,
  stage: PreparationStage,
): Promise<{ key: string; base64: string } | undefined> {
  if (
    item.Type !== "Episode" ||
    !item.SeriesId ||
    storage.getString(item.SeriesId)
  )
    return undefined;
  const url = getPrimaryImageUrlById({ api, id: item.SeriesId });
  if (!url) return undefined;
  const file = new File(Paths.cache, `${context.prefix}_series.jpg`);
  own(context, file);
  await downloadPreparationFile(
    url,
    file,
    getJellyfinHeadersForUrl(url, api.basePath),
    stage,
  );
  const base64 = await file.base64();
  stage.assertActive();
  file.delete();
  return { key: item.SeriesId, base64 };
}
export async function fetchSegments(
  itemId: string,
  api: Api,
  signal?: AbortSignal,
) {
  return fetchAndParseSegments(itemId, api, signal);
}

/** Required subtitles block on failure; optional art/segments never hold video indefinitely. */
export async function downloadAdditionalAssets(params: {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
  api: Api;
  operation: DownloadPreparation;
  selectedSubtitleIndex?: number;
}) {
  const { item, mediaSource, api, operation, selectedSubtitleIndex } = params;
  const context: AssetContext = {
    prefix: `${generateFilename(item)}_${operation.generation}`,
    owned: [],
  };
  const owned: (File | Directory)[] = [];
  const stage = async <T>(
    name: string,
    optional: boolean,
    idle: number,
    hard: number,
    work: (context: AssetContext, stage: PreparationStage) => Promise<T>,
  ) => {
    const local: AssetContext = {
      prefix: context.prefix,
      owned: [],
      allOwned: owned,
    };
    const start = Date.now();
    try {
      const result = await preparationStage(
        operation,
        (stage) => work(local, stage),
        idle,
        hard,
      );
      writeInfoLog("Download preparation", {
        stage: name,
        generation: operation.generation,
        ms: Date.now() - start,
        result: "ready",
      });
      return result;
    } catch (error) {
      cleanupPreparedFiles(local.owned);
      operation.assertActive();
      writeInfoLog("Download preparation", {
        stage: name,
        generation: operation.generation,
        ms: Date.now() - start,
        result: optional ? "optional_unavailable" : "failed",
      });
      if (!optional) throw error;
      return undefined;
    }
  };
  try {
    const selectedExternal = mediaSource.MediaStreams?.some(
      (s) =>
        s.Index === selectedSubtitleIndex &&
        s.Type === "Subtitle" &&
        s.DeliveryMethod === "External",
    );
    const prepareSubtitles = async () => {
      let source = cloneDownloadMedia(mediaSource);
      if (source.TranscodingUrl) return source;
      if (selectedExternal) {
        source = (await stage(
          "selected_subtitle",
          false,
          30_000,
          120_000,
          (ctx, state) =>
            downloadSubtitles(
              source,
              item,
              api.basePath,
              ctx,
              state,
              selectedSubtitleIndex,
              true,
            ),
        ))!;
      }
      const optional = await stage(
        "optional_subtitles",
        true,
        30_000,
        120_000,
        (ctx, state) =>
          downloadSubtitles(source, item, api.basePath, ctx, state),
      );
      // A stalled optional stage must retain the independently saved chosen track.
      return (
        optional ?? {
          ...source,
          MediaStreams: source.MediaStreams?.filter(
            (s) =>
              !(s.Type === "Subtitle" && s.DeliveryMethod === "External") ||
              s.DeliveryUrl?.startsWith("file:"),
          ),
        }
      );
    };
    const [trickPlayData, subtitleSource, segments, cover, series] =
      await Promise.all([
        stage("trickplay", true, 30_000, 120_000, (ctx, state) =>
          downloadTrickplayImages(item, api.basePath, ctx, state),
        ),
        prepareSubtitles(),
        item.Id
          ? stage("segments", true, 10_000, 10_000, (_ctx, state) =>
              fetchSegments(item.Id!, api, state.signal),
            )
          : Promise.resolve(undefined),
        stage("cover", true, 15_000, 60_000, (ctx, state) =>
          downloadCoverImage(item, api, ctx, state),
        ),
        stage("series_cover", true, 15_000, 60_000, (ctx, state) =>
          downloadSeriesImage(item, api, ctx, state),
        ),
      ]);
    operation.assertActive();
    // Optional subtitle timeouts strip external tracks; they are not available offline.
    const updatedMediaSource = subtitleSource ?? {
      ...cloneDownloadMedia(mediaSource),
      MediaStreams: mediaSource.MediaStreams?.filter(
        (s) => !(s.Type === "Subtitle" && s.DeliveryMethod === "External"),
      ).map((s) => ({ ...s })),
    };
    return {
      trickPlayData,
      updatedMediaSource,
      introSegments: segments?.introSegments,
      creditSegments: segments?.creditSegments,
      images: [cover, series].filter(
        (image): image is { key: string; base64: string } => !!image,
      ),
      ownedFiles: owned,
    };
  } catch (error) {
    operation.cancel("download_preparation_failed");
    cleanupPreparedFiles(owned);
    throw error;
  }
}
