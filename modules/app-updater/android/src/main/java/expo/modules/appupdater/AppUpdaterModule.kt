package expo.modules.appupdater

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * In-app updates for the WeaselPlex Android phone app, from the signed stable channel on
 * theweasel.tv. JS drives the flow (see modules/app-updater/index.ts):
 * checkForUpdate -> downloadUpdate -> installUpdate, which hands the verified APK to Android's
 * package installer. Android still asks the user to confirm, and refuses any APK that isn't
 * signed with the same key as the installed app.
 */
class AppUpdaterModule : Module() {
  companion object {
    private const val TAG = "AppUpdater"
    private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
  }

  private data class CheckedRelease(val release: VerifiedRelease, val envelope: ByteArray)

  private val context
    get() = requireNotNull(appContext.reactContext)

  private val updatesDirectory
    get() = File(context.cacheDir, "updates")

  @Volatile private var checked: CheckedRelease? = null

  @Volatile private var downloadedApk: File? = null

  @Volatile private var cancelRequested = false

  override fun definition() = ModuleDefinition {
    Name("AppUpdater")

    Events("onDownloadProgress")

    AsyncFunction("checkForUpdate") Coroutine { -> guarded { check() } }

    AsyncFunction("downloadUpdate") Coroutine { -> guarded { download() } }

    Function("cancelDownload") { cancelRequested = true }

    Function("canInstallPackages") { canInstallPackages() }

    Function("openInstallPermissionSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent =
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    AsyncFunction("installUpdate") Coroutine { -> guarded { install() } }
  }

  private suspend fun check(): Map<String, Any> {
    checked = null
    if (context.packageName != UpdatePolicy.PACKAGE_NAME) {
      return mapOf("status" to "unsupported", "reason" to "package")
    }
    // Development builds are signed with a debug key, so they can never install a release
    // over themselves. Say so instead of offering an update that would fail.
    if (PackageIdentity.installedSignerSha256(context) != UpdatePolicy.SIGNER_SHA256) {
      return mapOf("status" to "unsupported", "reason" to "signer")
    }
    val envelope = UpdateTransport.fetchManifest()
      ?: return mapOf("status" to "notPublished").also { clearCache() }
    val release = ManifestVerifier.verify(envelope, Build.VERSION.SDK_INT)
    val installed = installedVersionCode()
    val status =
      when {
        release.versionCode > installed -> "available"
        release.versionCode == installed -> "upToDate"
        else -> "ahead"
      }
    if (status == "available") {
      checked = CheckedRelease(release, envelope.copyOf())
    } else {
      // Running the newest build, so any APK left from installing it is just taking space.
      clearCache()
    }
    return mapOf(
      "status" to status,
      "versionName" to release.versionName,
      "versionCode" to release.versionCode.toDouble(),
      "apkSizeBytes" to release.apkSizeBytes.toDouble(),
    )
  }

  private suspend fun download() {
    val checked = checked ?: throw CodedException("ERR_UPDATE_STALE", "Check for updates again.", null)
    // Re-verify the exact envelope that was checked, as the WeaselTV updater does.
    val release = ManifestVerifier.verify(checked.envelope, Build.VERSION.SDK_INT)
    if (release != checked.release || release.versionCode <= installedVersionCode()) {
      throw UpdateSecurityException("The selected release is no longer newer than this app.")
    }
    cancelRequested = false
    downloadedApk = null
    val apk =
      UpdateTransport.downloadApk(release, updatesDirectory, { cancelRequested }) { downloaded, total ->
        sendEvent(
          "onDownloadProgress",
          mapOf("downloadedBytes" to downloaded.toDouble(), "totalBytes" to total.toDouble()),
        )
      }
    try {
      UpdatePolicy.validateDownloadedApk(release, PackageIdentity.inspectApk(context, apk), Build.VERSION.SDK_INT)
    } catch (error: Exception) {
      apk.delete()
      throw error
    }
    updatesDirectory.listFiles()?.filter { it != apk }?.forEach(File::delete)
    downloadedApk = apk
  }

  private fun install(): String {
    val apk =
      downloadedApk?.canonicalFile
        ?.takeIf { it.isFile && it.parentFile == updatesDirectory.canonicalFile }
        ?: throw CodedException("ERR_UPDATE_STALE", "Download the update again.", null)
    if (!canInstallPackages()) return "needsPermission"
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.appupdater.fileprovider", apk)
    val intent =
      Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, APK_MIME_TYPE)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        clipData = android.content.ClipData.newRawUri("WeaselPlex update", uri)
      }
    (appContext.currentActivity ?: context).startActivity(intent)
    return "installer"
  }

  private fun canInstallPackages(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

  private fun installedVersionCode(): Long =
    PackageInfoCompat.getLongVersionCode(context.packageManager.getPackageInfo(context.packageName, 0))

  private fun clearCache() {
    downloadedApk = null
    updatesDirectory.listFiles()?.forEach(File::delete)
  }

  /** Maps updater failures to stable codes for JS. */
  private suspend fun <T> guarded(block: suspend () -> T): T =
    try {
      block()
    } catch (error: CodedException) {
      throw error
    } catch (error: UpdateCancelledException) {
      throw CodedException("ERR_UPDATE_CANCELLED", error.message, error)
    } catch (error: UpdateSecurityException) {
      Log.w(TAG, "Update rejected: ${error.message}")
      throw CodedException("ERR_UPDATE_SECURITY", error.message, error)
    } catch (error: UpdateNetworkException) {
      Log.w(TAG, "Update network error: ${error.message}", error.cause)
      throw CodedException("ERR_UPDATE_NETWORK", error.message, error)
    }
}
