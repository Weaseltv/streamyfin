package expo.modules.appupdater

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import androidx.core.content.pm.PackageInfoCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.PublicKey
import java.security.spec.X509EncodedKeySpec
import java.time.Instant
import java.util.Base64
import java.security.Signature as JavaSignature

/*
 * Verifies WeaselPlex phone updates published through theweasel.tv direct distribution.
 *
 * Ported from the WeaselTV phone updater (weaseltv-apps, app-phone/.../update/UpdateSecurity.kt),
 * which defines the trust rules for these release files. Every rule lives here so the network
 * and UI code cannot relax them:
 *
 *  - The channel file is a signed envelope. Its payload must verify (SHA256withRSA over a
 *    domain prefix + payload) against a public key bundled in the app. A manifest can pick a key
 *    ID, never introduce a key.
 *  - The payload must name this product, package and channel, an immutable APK URL that matches
 *    its own version, a sane size and an uppercase SHA-256.
 *  - The installed app and the downloaded APK must both be signed with the WeaselFin key.
 */

internal class UpdateSecurityException(message: String, cause: Throwable? = null) : Exception(message, cause)

internal class UpdateNetworkException(message: String, cause: Throwable? = null) : Exception(message, cause)

internal data class VerifiedRelease(
  val versionCode: Long,
  val versionName: String,
  val minSdk: Int,
  val apkUrl: String,
  val apkSizeBytes: Long,
  val apkSha256: String,
)

internal data class ApkMetadata(
  val packageName: String,
  val versionCode: Long,
  val versionName: String?,
  val minSdk: Int?,
  val signerSha256: String,
)

internal object UpdatePolicy {
  const val HOST = "theweasel.tv"
  const val PRODUCT = "weaselplex-phone"
  const val PACKAGE_NAME = "tv.theweasel.weaselplex.phone"
  const val CHANNEL = "stable"
  const val MANIFEST_URL = "https://$HOST/releases/$PRODUCT/channels/$CHANNEL.json"

  /** The WeaselFin APK signing certificate (SHA-256), shared with WeaselPlex TV. */
  const val SIGNER_SHA256 = "132905A20B71385592CB42881951E2426A7278BDE5E41522CB91862767A2AE5A"

  /** The platform schema requires exactly this for weaselplex-phone in schema-v1 envelopes. */
  const val MINIMUM_SDK = 26

  const val MAX_MANIFEST_BYTES = 64 * 1024
  const val MAX_PAYLOAD_BYTES = 48 * 1024
  const val MAX_SIGNATURE_BYTES = 1024
  const val MAX_APK_BYTES = 512L * 1024L * 1024L

  private const val MAX_RELEASE_NOTES = 20
  private const val MAX_RELEASE_NOTE_CHARS = 300
  private const val MAX_RELEASE_NOTES_TOTAL_CHARS = 6_000
  private val VERSION_NAME = Regex("^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$")
  private val SHA256 = Regex("^[0-9A-F]{64}$")

  fun expectedApkUrl(versionName: String, versionCode: Long): String =
    "https://$HOST/releases/$PRODUCT/artifacts/$versionName-$versionCode/" +
      "WeaselTV-$PRODUCT-$versionName-$versionCode.apk"

  fun validatePayload(payload: JSONObject, schemaVersion: Int, deviceSdk: Int): VerifiedRelease {
    payload.requireOnlyKeys(
      required = setOf(
        "product", "packageName", "channel", "versionCode", "versionName", "minSdk", "apkUrl",
        "apkSizeBytes", "apkSha256", "releaseDate", "releaseNotes", "releaseIntent",
      ),
      optional = setOf("forwardRollbackOfVersionCode"),
      label = "signed update payload",
    )
    if (payload.string("product") != PRODUCT) {
      throw UpdateSecurityException("The manifest targets a different product.")
    }
    if (payload.string("packageName") != PACKAGE_NAME) {
      throw UpdateSecurityException("The manifest targets a different Android package.")
    }
    if (payload.string("channel") != CHANNEL) {
      throw UpdateSecurityException("The manifest does not match the stable channel.")
    }
    val versionCode = payload.long("versionCode").takeIf { it > 0 }
      ?: throw UpdateSecurityException("The manifest version code is invalid.")
    if (payload.string("releaseIntent") != "upgrade") {
      throw UpdateSecurityException("This app accepts upgrade releases only.")
    }
    if (payload.has("forwardRollbackOfVersionCode")) {
      val rollbackOf = payload.long("forwardRollbackOfVersionCode")
      if (rollbackOf <= 0 || rollbackOf >= versionCode) {
        throw UpdateSecurityException("The forward-rollback audit metadata is invalid.")
      }
    }
    val versionName = payload.string("versionName").takeIf(VERSION_NAME::matches)
      ?: throw UpdateSecurityException("The manifest version name is invalid.")
    val minSdk = payload.long("minSdk").toInt()
    val minSdkOk = when (schemaVersion) {
      1 -> minSdk == MINIMUM_SDK && deviceSdk >= MINIMUM_SDK
      2 -> minSdk in MINIMUM_SDK..deviceSdk
      else -> false
    }
    if (!minSdkOk) {
      throw UpdateSecurityException("This release does not support this device.")
    }
    val apkUrl = payload.string("apkUrl")
    validateHttpsUrl(apkUrl)
    if (apkUrl != expectedApkUrl(versionName, versionCode)) {
      throw UpdateSecurityException("The release APK URL does not match its signed version metadata.")
    }
    val apkSizeBytes = payload.long("apkSizeBytes").takeIf { it in 1..MAX_APK_BYTES }
      ?: throw UpdateSecurityException("The manifest APK size is invalid.")
    val apkSha256 = payload.string("apkSha256").takeIf(SHA256::matches)
      ?: throw UpdateSecurityException("The manifest APK checksum is invalid.")
    val releaseDate = payload.string("releaseDate")
    if (releaseDate.length !in 20..35 || !releaseDate.endsWith("Z") ||
      runCatching { Instant.parse(releaseDate) }.isFailure
    ) {
      throw UpdateSecurityException("The manifest release date is invalid.")
    }
    val notes = payload.opt("releaseNotes") as? JSONArray
      ?: throw UpdateSecurityException("The manifest release notes are missing.")
    val noteStrings = (0 until notes.length()).map { notes.opt(it) as? String }
    if (notes.length() !in 1..MAX_RELEASE_NOTES ||
      noteStrings.any { it == null || it.isBlank() || it.length > MAX_RELEASE_NOTE_CHARS || it.hasControlCharacter() } ||
      noteStrings.sumOf { it?.length ?: 0 } > MAX_RELEASE_NOTES_TOTAL_CHARS
    ) {
      throw UpdateSecurityException("The manifest release notes are invalid.")
    }
    return VerifiedRelease(versionCode, versionName, minSdk, apkUrl, apkSizeBytes, apkSha256)
  }

  fun validateDownloadedApk(release: VerifiedRelease, apk: ApkMetadata, deviceSdk: Int) {
    if (apk.packageName != PACKAGE_NAME) {
      throw UpdateSecurityException("The downloaded APK has the wrong package name.")
    }
    if (apk.versionCode != release.versionCode) {
      throw UpdateSecurityException("The downloaded APK has the wrong version code.")
    }
    if (apk.versionName != release.versionName) {
      throw UpdateSecurityException("The downloaded APK has the wrong version name.")
    }
    if (apk.signerSha256 != SIGNER_SHA256) {
      throw UpdateSecurityException("The downloaded APK has the wrong signing identity.")
    }
    apk.minSdk?.let {
      if (it != release.minSdk || it > deviceSdk) {
        throw UpdateSecurityException("The downloaded APK has incompatible SDK metadata.")
      }
    }
  }

  fun validateHttpsUrl(url: String): URI {
    val uri = runCatching { URI(url) }.getOrElse {
      throw UpdateSecurityException("The update URL is malformed.")
    }
    if (uri.scheme != "https" || uri.host != HOST || uri.port != -1 || uri.rawUserInfo != null ||
      uri.rawFragment != null || uri.rawQuery != null || uri.rawPath.isNullOrBlank()
    ) {
      throw UpdateSecurityException("The update URL is outside the approved HTTPS host.")
    }
    return uri
  }
}

/** Parses and verifies the signed channel envelope, then hands the payload to [UpdatePolicy]. */
internal object ManifestVerifier {
  private const val ALGORITHM = "SHA256withRSA"
  private const val KEY_ID = "weaseltv-release-2026-07-26"
  private const val KEY_SPKI_SHA256 = "1EC3445A54BDCE351077CC6B47027F05A556B786D2E21FD37B291EF58230B33D"

  // https://theweasel.tv/releases/keys/weaseltv-release-2026-07-26.pem, pinned by SHA-256 above.
  // Rotating the release key needs an app update that adds the new key BEFORE the switch.
  private const val KEY_SPKI_BASE64 =
    "MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAlclu/RuneutIuhxfgHNB" +
      "9Ro4dM6gkRc4mwqla703z0NFnHLPCujyOtwXrDokGPqFiyEJVERvZySlxTRie6qs" +
      "zjryR4DC84sxnHvCvkE3Sc5b5Shzq+m8z624q2L1W1psHCpa9/Fpc3Qz5YnvFp7" +
      "qk8mbKbGFK87XvjbfFZeqiGIPDhgZzBb+Pep3oK7Py86Ovzo1K0VkXPeWckYKUA5" +
      "rV32rPb8mz4gjCPa/QRGPFhyyG6L6+2OQ/jpUr3qcgi21lhK/LtD8eKt9laKqzT" +
      "RgMpwfRkzrODYQb6Chl9wdYnh3pr+EamXyPeEpWPDEF0TSDPoMlyT+ZRy45Us/xb" +
      "NP+JqVYV+xvevOcvjoT4mlYZ9HsymJg6ghZLNc9EuqqIj1N5m338SSFSVv1LYcgY" +
      "wi4OI8gavhRyam3cH4I22B2FI6n+2yIqeWIq2jchVCKGt6XotPOpjkyDpMM+rogp" +
      "ZrIM/8wYMKzDK93suXWLXiNnqiwZwPON37Firn4SVSv4dzvq+SFfr1PUBXDF5eEN" +
      "GnU2bPe0w+PDWpFJJEUNDZ+fg41sY7yNENIim7QIEc4Ax7AFSRdo39GoEV3Gqpvv" +
      "pfj4wyNalIxzKqwXFJAYEHS/cuIOZP72S/KGtAymD87Nksm28x+y63aOEmZ4tAM+" +
      "bYh3rsZ7Z05dpg1ZQQYEGHblMCAwEAAQ=="

  private val BASE64_URL = Regex("^[A-Za-z0-9_-]+$")

  private val publicKey: PublicKey by lazy {
    val encoded = Base64.getDecoder().decode(KEY_SPKI_BASE64)
    if (encoded.sha256Hex() != KEY_SPKI_SHA256) {
      throw UpdateSecurityException("The bundled update verification key failed its integrity check.")
    }
    KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(encoded))
  }

  fun verify(envelopeBytes: ByteArray, deviceSdk: Int): VerifiedRelease {
    if (envelopeBytes.isEmpty() || envelopeBytes.size > UpdatePolicy.MAX_MANIFEST_BYTES) {
      throw UpdateSecurityException("The update manifest exceeds the allowed size.")
    }
    val envelope = envelopeBytes.decodeStrictUtf8("update envelope").toJsonObject("update envelope")
    val schemaVersion = envelope.long("schemaVersion").toInt()
    when (schemaVersion) {
      1 -> envelope.requireOnlyKeys(
        required = setOf("schemaVersion", "keyId", "algorithm", "payload", "signature"),
        label = "update envelope",
      )
      2 -> {
        envelope.requireOnlyKeys(
          required = setOf(
            "schemaVersion", "keyId", "algorithm", "payloadEncoding", "signatureEncoding", "payload", "signature",
          ),
          label = "update envelope",
        )
        if (envelope.string("payloadEncoding") != "base64url" || envelope.string("signatureEncoding") != "base64url") {
          throw UpdateSecurityException("The schema-v2 update envelope encoding is unsupported.")
        }
      }
      else -> throw UpdateSecurityException("The update envelope schema is unsupported.")
    }
    if (envelope.string("algorithm") != ALGORITHM) {
      throw UpdateSecurityException("The update envelope uses an unsupported signing contract.")
    }
    if (envelope.string("keyId") != KEY_ID) {
      throw UpdateSecurityException("This WeaselPlex build cannot verify the current release feed.")
    }
    val payloadBytes = decodeBase64Url(envelope.string("payload"), UpdatePolicy.MAX_PAYLOAD_BYTES, "payload")
    val signatureBytes = decodeBase64Url(envelope.string("signature"), UpdatePolicy.MAX_SIGNATURE_BYTES, "signature")
    val prefix = "WeaselTV-Update-Manifest-v$schemaVersion\u0000".toByteArray(Charsets.UTF_8)
    val verified = runCatching {
      JavaSignature.getInstance(ALGORITHM).run {
        initVerify(publicKey)
        update(prefix + payloadBytes)
        verify(signatureBytes)
      }
    }.getOrDefault(false)
    if (!verified) {
      throw UpdateSecurityException("The update manifest signature is invalid.")
    }
    val payload = payloadBytes.decodeStrictUtf8("signed update payload").toJsonObject("signed update payload")
    return UpdatePolicy.validatePayload(payload, schemaVersion, deviceSdk)
  }

  private fun decodeBase64Url(value: String, maxBytes: Int, label: String): ByteArray {
    if (!BASE64_URL.matches(value)) {
      throw UpdateSecurityException("The update $label is not valid unpadded base64url.")
    }
    val decoded = runCatching { Base64.getUrlDecoder().decode(value) }.getOrElse {
      throw UpdateSecurityException("The update $label cannot be decoded.")
    }
    if (Base64.getUrlEncoder().withoutPadding().encodeToString(decoded) != value) {
      throw UpdateSecurityException("The update $label is not canonical unpadded base64url.")
    }
    if (decoded.isEmpty() || decoded.size > maxBytes) {
      throw UpdateSecurityException("The update $label exceeds the allowed size.")
    }
    return decoded
  }
}

/** Reads signing identities from Android. */
internal object PackageIdentity {
  /** SHA-256 of the installed app's single signing certificate. */
  fun installedSignerSha256(context: Context): String {
    val info = context.packageManager.getPackageInfo(context.packageName, signatureFlags())
    return singleSignerSha256(info, "installed app")
  }

  fun inspectApk(context: Context, apk: File): ApkMetadata {
    val info = context.packageManager.getPackageArchiveInfo(apk.absolutePath, signatureFlags())
      ?: throw UpdateSecurityException("Android could not inspect the downloaded APK.")
    return ApkMetadata(
      packageName = info.packageName,
      versionCode = PackageInfoCompat.getLongVersionCode(info),
      versionName = info.versionName,
      minSdk = info.applicationInfo?.minSdkVersion,
      signerSha256 = singleSignerSha256(info, "downloaded APK"),
    )
  }

  @Suppress("DEPRECATION")
  private fun signatureFlags(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      PackageManager.GET_SIGNING_CERTIFICATES
    } else {
      PackageManager.GET_SIGNATURES
    }

  @Suppress("DEPRECATION")
  private fun singleSignerSha256(info: PackageInfo, label: String): String {
    val signers: List<Signature> =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        info.signingInfo?.apkContentsSigners?.toList().orEmpty()
      } else {
        info.signatures?.toList().orEmpty()
      }
    if (signers.size != 1) {
      throw UpdateSecurityException("The $label does not have exactly one signer.")
    }
    return signers.single().toByteArray().sha256Hex()
  }
}

internal fun ByteArray.sha256Hex(): String =
  MessageDigest.getInstance("SHA-256").digest(this).joinToString("") { "%02X".format(it) }

private fun ByteArray.decodeStrictUtf8(label: String): String =
  runCatching {
    Charsets.UTF_8.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
      .decode(ByteBuffer.wrap(this))
      .toString()
  }.getOrElse { throw UpdateSecurityException("The $label is not valid UTF-8.", it) }

private fun String.toJsonObject(label: String): JSONObject =
  runCatching { JSONObject(this) }.getOrElse { throw UpdateSecurityException("The $label is invalid JSON.", it) }

private fun JSONObject.requireOnlyKeys(required: Set<String>, optional: Set<String> = emptySet(), label: String) {
  val present = keys().asSequence().toSet()
  if (!present.containsAll(required) || !(required + optional).containsAll(present)) {
    throw UpdateSecurityException("The $label has missing or unexpected fields.")
  }
}

private fun JSONObject.string(key: String): String =
  opt(key) as? String ?: throw UpdateSecurityException("The update field '$key' must be text.")

private fun JSONObject.long(key: String): Long =
  when (val value = opt(key)) {
    is Int -> value.toLong()
    is Long -> value
    else -> throw UpdateSecurityException("The update field '$key' must be a whole number.")
  }

private fun String.hasControlCharacter(): Boolean = any { it.code in 0..31 || it.code == 127 }
