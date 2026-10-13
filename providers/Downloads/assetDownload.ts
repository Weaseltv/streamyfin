import { File } from "expo-file-system";
import { createDownloadResumable } from "expo-file-system/legacy";
import type { PreparationStage } from "./preparation";

/** Cancellable I/O to an operation-owned name, including cleanup of late writes. */
export async function downloadPreparationFile(
  url: string,
  file: File,
  headers: Record<string, string> | undefined,
  stage: PreparationStage,
) {
  stage.assertActive();
  const task = createDownloadResumable(url, file.uri, { headers }, (progress) =>
    stage.progress(progress.totalBytesWritten),
  );
  const abort = () => {
    void task.cancelAsync().catch(() => {});
  };
  stage.signal.addEventListener("abort", abort, { once: true });
  try {
    const result = await task.downloadAsync();
    stage.assertActive();
    if (!result || result.status < 200 || result.status >= 300)
      throw new Error("download_asset_http_failure");
    // Small files can finish without a native progress callback.
    stage.progress(file.size);
    return file;
  } finally {
    stage.signal.removeEventListener("abort", abort);
    if (stage.signal.aborted) {
      try {
        if (file.exists) file.delete();
      } catch {
        /* Own late result only. */
      }
    }
  }
}
