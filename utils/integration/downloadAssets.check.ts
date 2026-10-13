/** Run separately: native filesystem mocks must never leak into the unit suite. */
import { mock } from "bun:test";
import { strict as assert } from "node:assert";
import { AbortController as NativeAbortController } from "abort-controller/dist/abort-controller";

const originalAbortController = globalThis.AbortController;
globalThis.AbortController =
  NativeAbortController as unknown as typeof AbortController;
const files = new Map<string, string>();
const directories = new Set<string>();
class TestFile {
  uri: string;
  constructor(root: string | { uri: string }, name?: string) {
    this.uri = `${typeof root === "string" ? root : root.uri}${name ? `/${name}` : ""}`;
  }
  get exists() {
    return files.has(this.uri);
  }
  get size() {
    return files.get(this.uri)?.length ?? 0;
  }
  delete() {
    files.delete(this.uri);
  }
  async base64() {
    return files.get(this.uri) ?? "";
  }
}
class TestDirectory {
  uri: string;
  constructor(root: string, name: string) {
    this.uri = `${root}/${name}`;
  }
  get exists() {
    return directories.has(this.uri);
  }
  create() {
    directories.add(this.uri);
  }
  delete() {
    directories.delete(this.uri);
    for (const key of files.keys())
      if (key.startsWith(`${this.uri}/`)) files.delete(key);
  }
}
mock.module("expo-file-system", () => ({
  File: TestFile,
  Directory: TestDirectory,
  Paths: { document: "file:///Documents", cache: "file:///Cache" },
}));
mock.module("@/utils/customHeaders", () => ({
  getJellyfinHeadersForUrl: () => undefined,
}));
mock.module("@/utils/getItemImage", () => ({ getItemImage: () => undefined }));
mock.module("@/utils/jellyfin/image/getPrimaryImageUrlById", () => ({
  getPrimaryImageUrlById: () => undefined,
}));
mock.module("@/utils/log", () => ({ writeInfoLog: () => {} }));
mock.module("@/utils/mmkv", () => ({
  storage: { getString: () => undefined },
}));
mock.module("@/utils/segments", () => ({
  fetchAndParseSegments: async () => undefined,
}));
mock.module("@/utils/trickplay", () => ({
  generateTrickplayUrl: () => undefined,
  getTrickplayInfo: () => undefined,
}));
let mode: "optional-stall" | "selected-failure" | "late-cancel" =
  "optional-stall";
let finishLate: (() => void) | undefined;
mock.module("expo-file-system/legacy", () => ({
  createDownloadResumable: (url: string, uri: string) => ({
    cancelAsync: async () => {},
    downloadAsync: async () => {
      if (mode === "selected-failure" && url.endsWith("selected.srt"))
        return { status: 403 };
      if (mode === "late-cancel")
        return await new Promise((resolve) => {
          finishLate = () => {
            files.set(uri, "late");
            resolve({ status: 200 });
          };
        });
      if (url.endsWith("optional.srt")) return await new Promise(() => {});
      files.set(uri, "subtitle"); // No progress callback, like small native responses.
      return { status: 200 };
    },
  }),
}));
const { downloadAdditionalAssets, cleanupPreparedFiles } = await import(
  "../../providers/Downloads/additionalDownloads"
);
const { DownloadPreparations } = await import(
  "../../providers/Downloads/preparation"
);
const registry = new DownloadPreparations();
const item = { Id: "movie", Type: "Movie" as const, Name: "Fixture" };
const source = {
  Id: "source",
  MediaStreams: [
    {
      Type: "Subtitle" as const,
      Index: 2,
      DeliveryMethod: "External" as const,
      DeliveryUrl: "/selected.srt",
      Codec: "srt",
    },
    {
      Type: "Subtitle" as const,
      Index: 3,
      DeliveryMethod: "External" as const,
      DeliveryUrl: "/optional.srt",
      Codec: "srt",
    },
  ],
};
// Speed up real preparation deadlines in this isolated process; no app configuration changes.
const originalTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
  originalTimeout(
    fn,
    Math.max(1, (ms ?? 0) / 1000),
    ...args,
  )) as typeof setTimeout;
const api = { basePath: "https://fixture.invalid" } as Parameters<
  typeof downloadAdditionalAssets
>[0]["api"];
try {
  const operation = registry.reserve("movie", "fixture")!;
  const result = await downloadAdditionalAssets({
    item,
    mediaSource: source,
    api,
    operation,
    selectedSubtitleIndex: 2,
  });
  assert.equal(result.updatedMediaSource.MediaStreams?.length, 1);
  const selected = result.updatedMediaSource.MediaStreams?.[0].DeliveryUrl;
  assert(selected);
  assert(selected.startsWith("file:"));
  assert(
    files.has(selected),
    "selected file survives the optional track deadline",
  );
  assert.equal(
    source.MediaStreams[0].DeliveryUrl,
    "/selected.srt",
    "server metadata stays immutable",
  );
  cleanupPreparedFiles(result.ownedFiles);
  registry.release(operation);
  assert.equal(files.size, 0);

  mode = "selected-failure";
  const failed = registry.reserve("movie", "fixture")!;
  await assert.rejects(
    downloadAdditionalAssets({
      item,
      mediaSource: source,
      api,
      operation: failed,
      selectedSubtitleIndex: 2,
    }),
    /selected_subtitle_unavailable/,
  );
  registry.release(failed);
  assert.equal(files.size, 0);

  mode = "late-cancel";
  const cancelled = registry.reserve("movie", "fixture")!;
  const task = downloadAdditionalAssets({
    item,
    mediaSource: source,
    api,
    operation: cancelled,
    selectedSubtitleIndex: 2,
  });
  await Promise.resolve();
  cancelled.cancel();
  await assert.rejects(task, /cancelled/);
  finishLate?.();
  await new Promise((resolve) => originalTimeout(resolve, 5));
  assert.equal(files.size, 0, "cancelled late native file is cleaned");
  registry.release(cancelled);
  console.log(
    "DOWNLOAD ASSET CHECK OK: selected/optional isolation, immutable metadata, required failure, cancellation and late-file cleanup",
  );
} finally {
  globalThis.setTimeout = originalTimeout;
  globalThis.AbortController = originalAbortController;
}
