package expo.modules.backgrounddownloader

import android.util.Log
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * Streams downloads into `<destination>.part` and renames on completion.
 *
 * Interrupted transfers are retried with backoff instead of failing and
 * throwing the partial file away (R21). How a retry continues depends on what
 * the server promised for the file:
 *
 * - **Resumable**: the response carried `Accept-Ranges: bytes`, a validator
 *   (ETag or Last-Modified) and a length. The retry sends `Range` from the end
 *   of the part file with `If-Range` set to that validator, so the server only
 *   answers 206 if the file is byte-identical to what we already have; a
 *   changed file comes back as a full 200 and we start over. Jellyfin's
 *   `static=true` streams are like this.
 * - **Not resumable**: anything else, which includes every server-side remux or
 *   transcode (their bytes differ per negotiation). The retry restarts from
 *   zero rather than appending bytes from a different encode.
 *
 * The validator is kept next to the part file (`.part.json`), so a download
 * that exhausts its retries, or dies with the process, can still resume when it
 * is started again for the same destination.
 */
class OkHttpDownloadManager {
  private val TAG = "OkHttpDownloadManager"

  private val client = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .callTimeout(0, TimeUnit.SECONDS) // No timeout for long transcodes
    .build()

  private companion object {
    /** Waits between attempts after a failure; the last one repeats. */
    val RETRY_DELAYS_MS = longArrayOf(2_000, 5_000, 10_000, 20_000, 30_000)
    /** Attempts in total, first one included (~4 minutes of waiting). */
    const val MAX_ATTEMPTS = 10
  }

  /** One running download. Mutated only from its own worker thread. */
  private class Task(val taskId: Int) {
    @Volatile var cancelled = false
    @Volatile var call: Call? = null
    @Volatile var thread: Thread? = null
  }

  // Mutated from the JS thread (start/cancel) and the worker threads.
  private val activeDownloads = ConcurrentHashMap<Int, Task>()

  /** What the server told us about the file behind a part. */
  private data class PartInfo(val validator: String, val totalBytes: Long, val path: String) {
    fun toJson(): String = JSONObject()
      .put("validator", validator)
      .put("totalBytes", totalBytes)
      .put("path", path)
      .toString()

    companion object {
      fun read(file: File): PartInfo? = try {
        val json = JSONObject(file.readText())
        PartInfo(json.getString("validator"), json.getLong("totalBytes"), json.getString("path"))
      } catch (e: Exception) {
        null
      }
    }
  }

  /** Thrown for failures a retry cannot fix (HTTP 4xx, disk). */
  private class PermanentFailure(message: String) : IOException(message)

  fun startDownload(
    taskId: Int,
    url: String,
    destinationPath: String,
    headers: Map<String, String>? = null,
    onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit,
    onComplete: (filePath: String) -> Unit,
    onError: (error: String) -> Unit
  ) {
    Log.d(TAG, "Starting download: taskId=$taskId, url=$url")

    val task = Task(taskId)
    activeDownloads[taskId] = task

    val worker = Thread({
      try {
        run(task, url, destinationPath, headers, onProgress)
        if (!task.cancelled) {
          Log.d(TAG, "Download completed: taskId=$taskId")
          activeDownloads.remove(taskId)
          onComplete(destinationPath)
        }
      } catch (e: Exception) {
        activeDownloads.remove(taskId)
        if (task.cancelled) {
          Log.d(TAG, "Download cancelled: taskId=$taskId")
        } else {
          Log.e(TAG, "Download failed: taskId=$taskId, error=${e.message}")
          onError(e.message ?: "Download failed")
        }
      }
    }, "download-$taskId")
    task.thread = worker
    worker.isDaemon = true
    worker.start()
  }

  private fun run(
    task: Task,
    url: String,
    destinationPath: String,
    headers: Map<String, String>?,
    onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit
  ) {
    val destFile = File(destinationPath)
    val partFile = File("$destinationPath.part")
    val infoFile = File("$destinationPath.part.json")
    destFile.parentFile?.takeIf { !it.exists() }?.mkdirs()

    var attempt = 0
    while (true) {
      attempt += 1
      try {
        transferOnce(task, url, headers, partFile, infoFile, onProgress)
        if (task.cancelled) throw IOException("cancelled")
        if (destFile.exists()) destFile.delete()
        if (!partFile.renameTo(destFile)) {
          throw PermanentFailure("Failed to move completed file into place")
        }
        infoFile.delete()
        return
      } catch (e: IOException) {
        if (task.cancelled) {
          partFile.delete()
          infoFile.delete()
          throw e
        }
        if (e is PermanentFailure || attempt >= MAX_ATTEMPTS) {
          // Keep a resumable part: starting the same download again picks up
          // where this one stopped. A part we could not resume is useless.
          if (!infoFile.exists()) partFile.delete()
          throw e
        }
        val delay = RETRY_DELAYS_MS[minOf(attempt - 1, RETRY_DELAYS_MS.size - 1)]
        Log.w(TAG, "Download interrupted (attempt $attempt/$MAX_ATTEMPTS): ${e.message}; retrying in ${delay}ms")
        try {
          Thread.sleep(delay)
        } catch (interrupted: InterruptedException) {
          if (task.cancelled) {
            partFile.delete()
            infoFile.delete()
            throw IOException("cancelled")
          }
        }
      }
    }
  }

  /**
   * One HTTP attempt. Returns normally when the part file holds the whole
   * file; throws IOException to be retried, PermanentFailure otherwise.
   */
  private fun transferOnce(
    task: Task,
    url: String,
    headers: Map<String, String>?,
    partFile: File,
    infoFile: File,
    onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit
  ) {
    val urlPath = url.substringBefore('?')
    val info = PartInfo.read(infoFile)?.takeIf { it.path == urlPath }
    val offset = if (info != null && partFile.exists()) partFile.length() else 0L

    val requestBuilder = Request.Builder().url(url)
    headers?.forEach { (key, value) -> requestBuilder.addHeader(key, value) }
    if (info != null && offset > 0) {
      requestBuilder.header("Range", "bytes=$offset-")
      requestBuilder.header("If-Range", info.validator)
      Log.d(TAG, "Resuming taskId=${task.taskId} at $offset of ${info.totalBytes}")
    }

    val call = client.newCall(requestBuilder.build())
    task.call = call
    if (task.cancelled) call.cancel()

    call.execute().use { response ->
      when {
        response.code == 206 && info != null && offset > 0 -> {
          val range = parseContentRange(response.header("Content-Range"))
          if (range == null || range.first != offset || range.second != info.totalBytes) {
            // Not the continuation we asked for; never splice it in.
            Log.w(TAG, "Unexpected Content-Range ${response.header("Content-Range")}; restarting")
            partFile.delete()
            infoFile.delete()
            throw IOException("Server sent a different range")
          }
          write(task, response, partFile, append = true, offset, info.totalBytes, onProgress)
        }
        response.code == 416 && info != null -> {
          // Nothing left to send: complete if the part is the whole file,
          // otherwise the part is not what we think it is.
          if (partFile.length() == info.totalBytes) return
          partFile.delete()
          infoFile.delete()
          throw IOException("Range not satisfiable")
        }
        response.isSuccessful -> {
          // A full body: the first attempt, a changed file (If-Range failed)
          // or a server that ignores ranges. Start the part over.
          val total = response.body?.contentLength() ?: -1L
          val resumable = resumeInfo(response, urlPath, total)
          if (resumable != null) infoFile.writeText(resumable.toJson()) else infoFile.delete()
          write(task, response, partFile, append = false, 0L, total, onProgress)
        }
        response.code in 400..499 && response.code != 408 && response.code != 429 -> {
          throw PermanentFailure("HTTP error: ${response.code} ${response.message}")
        }
        else -> throw IOException("HTTP error: ${response.code} ${response.message}")
      }
    }
  }

  private fun resumeInfo(response: Response, urlPath: String, total: Long): PartInfo? {
    if (total <= 0) return null
    if (!response.header("Accept-Ranges").equals("bytes", ignoreCase = true)) return null
    // A strong ETag is the better validator; weak ones cannot be used with
    // If-Range. Last-Modified is what Jellyfin sends for static files.
    val etag = response.header("ETag")?.takeIf { !it.startsWith("W/") }
    val validator = etag ?: response.header("Last-Modified") ?: return null
    return PartInfo(validator, total, urlPath)
  }

  /** `bytes <start>-<end>/<total>` -> (start, total). */
  private fun parseContentRange(value: String?): Pair<Long, Long>? {
    val match = Regex("""bytes (\d+)-\d+/(\d+)""").find(value ?: return null) ?: return null
    return match.groupValues[1].toLong() to match.groupValues[2].toLong()
  }

  private fun write(
    task: Task,
    response: Response,
    partFile: File,
    append: Boolean,
    startOffset: Long,
    totalBytes: Long,
    onProgress: (bytesWritten: Long, totalBytes: Long) -> Unit
  ) {
    val input = response.body?.byteStream() ?: throw IOException("Failed to get response body")
    var bytesWritten = startOffset
    var lastProgressUpdate = 0L
    val buffer = ByteArray(8192)

    input.use {
      FileOutputStream(partFile, append).use { output ->
        while (true) {
          if (task.cancelled) throw IOException("cancelled")
          val bytes = input.read(buffer)
          if (bytes < 0) break
          output.write(buffer, 0, bytes)
          bytesWritten += bytes

          // Throttle progress updates to every 500ms
          val now = System.currentTimeMillis()
          if (now - lastProgressUpdate >= 500) {
            onProgress(bytesWritten, totalBytes)
            lastProgressUpdate = now
          }
        }
      }
    }

    if (totalBytes > 0 && bytesWritten < totalBytes) {
      // The body ended early without an exception (connection closed).
      throw IOException("Connection closed at $bytesWritten of $totalBytes bytes")
    }
    // Send final progress update
    onProgress(bytesWritten, totalBytes)
  }

  fun cancelDownload(taskId: Int) {
    Log.d(TAG, "Cancelling download: taskId=$taskId")
    activeDownloads.remove(taskId)?.let { cancel(it) }
  }

  fun cancelAllDownloads() {
    Log.d(TAG, "Cancelling all downloads")
    activeDownloads.values.forEach { cancel(it) }
    activeDownloads.clear()
  }

  private fun cancel(task: Task) {
    task.cancelled = true
    task.call?.cancel()
    task.thread?.interrupt() // wakes a backoff sleep
  }

  fun hasActiveDownloads(): Boolean {
    return activeDownloads.isNotEmpty()
  }
}
