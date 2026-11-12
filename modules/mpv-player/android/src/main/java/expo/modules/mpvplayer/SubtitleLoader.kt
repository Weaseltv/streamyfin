package expo.modules.mpvplayer

import android.content.Context
import android.os.SystemClock
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Per-source IO only. MPV calls and readiness remain on mpv-command. */
internal class SubtitleLoader(private val context: Context) {
    private val closed = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "mpv-subtitle-fetch").apply { isDaemon = true }
    }
    private val files = ConcurrentHashMap.newKeySet<File>()

    fun fetch(url: String, headers: Map<String, String>?, headerOrigin: String?, deliver: (String?) -> Unit) {
        executor.execute {
            var local: File? = null
            var result: String? = null
            try {
                val remote = url.startsWith("http://") || url.startsWith("https://")
                val uri = if (remote) URI(url.replace(" ", "%20")) else URI("")
                val extension = (uri.path?.substringAfterLast('.', "")?.lowercase() ?: "")
                    .takeIf { it.matches(Regex("[a-z0-9]{1,8}")) } ?: ""
                // Local files are already available. Preserve libmpv's paired
                // VobSub URL handling instead of turning .idx/.sub into an
                // incomplete standalone temporary file.
                if (!remote || extension in listOf("idx", "sub")) {
                    result = url
                } else {
                    local = File.createTempFile("mpv-sidecar-", ".${extension.ifEmpty { "srt" }}", context.cacheDir)
                    val targetFile = local
                    files.add(targetFile)
                    val deadline = SystemClock.elapsedRealtime() + 30_000L
                    var target = uri
                    var downloaded = false
                    for (redirect in 0..5) {
                        if (closed.get() || SystemClock.elapsedRealtime() >= deadline) break
                        val connection = target.toURL().openConnection() as HttpURLConnection
                        try {
                            connection.connectTimeout = 5_000
                            connection.readTimeout = 5_000
                            connection.instanceFollowRedirects = false
                            if (sameOrigin(target, headerOrigin)) {
                                headers?.forEach { (name, value) -> connection.setRequestProperty(name, value) }
                            }
                            val status = connection.responseCode
                            if (status in listOf(301, 302, 303, 307, 308)) {
                                val location = connection.getHeaderField("Location") ?: break
                                target = target.resolve(location)
                                continue
                            }
                            if (status !in 200..299) break
                            connection.inputStream.use { input ->
                                targetFile.outputStream().use { output ->
                                    val buffer = ByteArray(16 * 1024)
                                    while (!closed.get() && SystemClock.elapsedRealtime() < deadline) {
                                        val count = input.read(buffer)
                                        if (count < 0) { downloaded = true; break }
                                        output.write(buffer, 0, count)
                                    }
                                }
                            }
                            break
                        } finally { connection.disconnect() }
                    }
                    if (downloaded && !closed.get()) result = targetFile.absolutePath
                }
            } catch (_: Exception) {
                // URLs and request exceptions can carry tokens: never log them.
            } finally {
                if (closed.get() || result == null) {
                    local?.delete()
                    local?.let { files.remove(it) }
                    result = null
                }
                deliver(result)
            }
        }
    }

    /** Nonblocking cancellation; a read completes within its bounded timeout. */
    fun cancel() {
        closed.set(true)
        executor.shutdownNow()
    }

    fun close() {
        cancel()
        files.forEach { it.delete() }
        files.clear()
    }

    private fun sameOrigin(uri: URI, origin: String?): Boolean = try {
        val other = URI(origin ?: "")
        fun port(value: URI) = if (value.port >= 0) value.port else if (value.scheme == "https") 443 else 80
        uri.scheme.equals(other.scheme, true) && uri.host != null &&
            uri.host.equals(other.host, true) && port(uri) == port(other)
    } catch (_: Exception) { false }
}
