package expo.modules.appupdater

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.URL
import java.security.MessageDigest
import javax.net.ssl.HttpsURLConnection

internal class UpdateCancelledException : Exception("The update download was cancelled.")

/**
 * HTTPS for the updater. Redirects are refused, so a response can never move the manifest or
 * APK to another host; caching is off so a stale channel file is never served.
 */
internal object UpdateTransport {
  private const val CONNECT_TIMEOUT_MS = 10_000
  private const val READ_TIMEOUT_MS = 60_000
  private const val PROGRESS_INTERVAL_BYTES = 256L * 1024L
  private const val BUFFER_BYTES = 64 * 1024

  /** The signed channel file, or null when nothing is published (HTTP 404). */
  suspend fun fetchManifest(): ByteArray? =
    withContext(Dispatchers.IO) {
      request(UpdatePolicy.MANIFEST_URL, allowed = setOf(200, 404)) { connection ->
        if (connection.responseCode == 404) return@request null
        if (connection.contentLengthLong > UpdatePolicy.MAX_MANIFEST_BYTES) {
          throw UpdateSecurityException("The update manifest exceeds the allowed size.")
        }
        val output = ByteArrayOutputStream()
        connection.inputStream.use { input ->
          val buffer = ByteArray(8 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            if (output.size() + read > UpdatePolicy.MAX_MANIFEST_BYTES) {
              throw UpdateSecurityException("The update manifest exceeds the allowed size.")
            }
            output.write(buffer, 0, read)
          }
        }
        output.toByteArray()
      }
    }

  /**
   * Downloads [release] into [directory], checking the exact size and SHA-256 from the signed
   * manifest. A file already there from an earlier attempt (say, before Android restarted the
   * app to grant the install permission) is reused if it still matches.
   */
  suspend fun downloadApk(
    release: VerifiedRelease,
    directory: File,
    isCancelled: () -> Boolean,
    onProgress: (downloadedBytes: Long, totalBytes: Long) -> Unit,
  ): File =
    withContext(Dispatchers.IO) {
      if (!directory.isDirectory && !directory.mkdirs()) {
        throw UpdateNetworkException("The update cache could not be created.")
      }
      val finalFile = File(directory, cachedApkName(release))
      if (finalFile.isFile && matches(finalFile, release)) {
        onProgress(release.apkSizeBytes, release.apkSizeBytes)
        return@withContext finalFile
      }
      val partFile = File(directory, "${finalFile.name}.part")
      partFile.delete()
      finalFile.delete()
      try {
        request(release.apkUrl, allowed = setOf(200)) { connection ->
          val declared = connection.contentLengthLong
          if (declared >= 0 && declared != release.apkSizeBytes) {
            throw UpdateSecurityException("The release APK size does not match its signed manifest.")
          }
          val digest = MessageDigest.getInstance("SHA-256")
          var total = 0L
          var lastReported = 0L
          connection.inputStream.use { input ->
            FileOutputStream(partFile).use { output ->
              val buffer = ByteArray(BUFFER_BYTES)
              while (true) {
                if (isCancelled()) throw UpdateCancelledException()
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > release.apkSizeBytes) {
                  throw UpdateSecurityException("The release APK exceeds the size in its signed manifest.")
                }
                output.write(buffer, 0, read)
                digest.update(buffer, 0, read)
                if (total - lastReported >= PROGRESS_INTERVAL_BYTES || total == release.apkSizeBytes) {
                  lastReported = total
                  onProgress(total, release.apkSizeBytes)
                }
              }
              output.fd.sync()
            }
          }
          if (total != release.apkSizeBytes) {
            throw UpdateSecurityException("The release APK download is incomplete.")
          }
          if (!MessageDigest.isEqual(digest.hex().toByteArray(), release.apkSha256.toByteArray())) {
            throw UpdateSecurityException("The release APK checksum does not match its signed manifest.")
          }
          if (!partFile.renameTo(finalFile)) {
            throw UpdateNetworkException("The verified APK could not be saved.")
          }
        }
        finalFile
      } catch (error: Exception) {
        partFile.delete()
        finalFile.delete()
        throw error
      }
    }

  fun cachedApkName(release: VerifiedRelease): String =
    "${UpdatePolicy.PRODUCT}-${release.versionCode}-${release.apkSha256.take(12).lowercase()}.apk"

  private fun matches(file: File, release: VerifiedRelease): Boolean {
    if (file.length() != release.apkSizeBytes) return false
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(BUFFER_BYTES)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return MessageDigest.isEqual(digest.hex().toByteArray(), release.apkSha256.toByteArray())
  }

  private fun <T> request(url: String, allowed: Set<Int>, block: (HttpsURLConnection) -> T): T {
    UpdatePolicy.validateHttpsUrl(url)
    val connection = URL(url).openConnection() as? HttpsURLConnection
      ?: throw UpdateSecurityException("The update URL is not HTTPS.")
    connection.instanceFollowRedirects = false
    connection.useCaches = false
    connection.connectTimeout = CONNECT_TIMEOUT_MS
    connection.readTimeout = READ_TIMEOUT_MS
    connection.setRequestProperty("Cache-Control", "no-cache, no-store")
    try {
      val code = connection.responseCode
      if (code in 300..399) {
        throw UpdateSecurityException("Update redirects are not allowed.")
      }
      if (code !in allowed) {
        throw UpdateNetworkException("The update server returned HTTP $code.")
      }
      if (connection.url.toString() != url) {
        throw UpdateSecurityException("The update request left its approved URL.")
      }
      return block(connection)
    } catch (error: IOException) {
      throw UpdateNetworkException("The update could not be downloaded.", error)
    } finally {
      connection.disconnect()
    }
  }

  private fun MessageDigest.hex(): String = digest().joinToString("") { "%02X".format(it) }
}
