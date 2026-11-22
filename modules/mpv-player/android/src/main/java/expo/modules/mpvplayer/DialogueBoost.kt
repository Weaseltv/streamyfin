package expo.modules.mpvplayer

import android.media.audiofx.DynamicsProcessing
import android.media.audiofx.Equalizer
import android.os.Build
import android.util.Log
import java.util.Locale
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * The player's "Dialogue boost" on Android.
 *
 * iOS runs it inside mpv as an FFmpeg filter chain (MPVLayerRenderer.swift
 * setDialogueBoost): `af=lavfi=[equalizer=f=100:t=q:w=1.2:g=-6,
 * equalizer=f=2800:t=q:w=1.2:g=5]`, a 6 dB cut around 100 Hz and a 5 dB lift
 * around 2.8 kHz, both with Q 1.2. The libmpv Android uses
 * (dev.jdtech.mpv:libmpv) ships a trimmed libavfilter without the
 * `equalizer` filter, so that chain fails there. The same curve runs instead
 * as an Android audio effect on mpv's audio session (mpv's AudioTrack is
 * opened on [sessionId] via `audiotrack-session-id`): the pre-EQ of
 * DynamicsProcessing (API 28+), or the platform Equalizer on API 26-27, with
 * each band set to the iOS curve's gain at the band's centre frequency.
 *
 * Every call does binder IPC, so the renderer calls this on its command
 * thread.
 */
internal class DialogueBoost(private val sessionId: Int) {

    private var dynamics: DynamicsProcessing? = null
    private var equalizer: Equalizer? = null

    /** Turns the curve on or off. Returns a one-line state for the log. */
    fun setEnabled(enabled: Boolean): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val effect = dynamics ?: createDynamics()?.also { dynamics = it }
            if (effect != null) {
                effect.setEnabled(enabled)
                return "DynamicsProcessing session=$sessionId enabled=${effect.enabled} " +
                    "control=${effect.hasControl()} preEq=${describeDynamics(effect)}"
            }
        }
        val effect = equalizer ?: createEqualizer()?.also { equalizer = it }
            ?: return "unavailable on session $sessionId"
        effect.setEnabled(enabled)
        return "Equalizer session=$sessionId enabled=${effect.enabled} " +
            "control=${effect.hasControl()} bands=${describeEqualizer(effect)}"
    }

    fun release() {
        try { dynamics?.release() } catch (_: Exception) {}
        try { equalizer?.release() } catch (_: Exception) {}
        dynamics = null
        equalizer = null
    }

    private fun createDynamics(): DynamicsProcessing? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
        return try {
            val eq = DynamicsProcessing.Eq(true, true, BAND_EDGES_HZ.size)
            var lower = LOWEST_HZ
            BAND_EDGES_HZ.forEachIndexed { index, upper ->
                val gain = curveDb(sqrt(lower * upper)).toFloat()
                eq.setBand(index, DynamicsProcessing.EqBand(true, upper.toFloat(), gain))
                lower = upper
            }
            val config = DynamicsProcessing.Config.Builder(
                DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION,
                2,
                true, BAND_EDGES_HZ.size,
                false, 0,
                false, 0,
                false
            ).setPreEqAllChannelsTo(eq).build()
            // The effect copies channel 0's settings to any extra channels.
            DynamicsProcessing(0, sessionId, config)
        } catch (e: Exception) {
            Log.w(TAG, "DynamicsProcessing unavailable on session $sessionId: ${e.message}")
            null
        }
    }

    private fun createEqualizer(): Equalizer? = try {
        Equalizer(0, sessionId).also { effect ->
            val range = effect.bandLevelRange
            for (band in 0 until effect.numberOfBands) {
                val centreHz = effect.getCenterFreq(band.toShort()) / 1000.0
                val millibels = (curveDb(centreHz) * 100).roundToInt()
                    .coerceIn(range[0].toInt(), range[1].toInt())
                effect.setBandLevel(band.toShort(), millibels.toShort())
            }
        }
    } catch (e: Exception) {
        Log.w(TAG, "Equalizer unavailable on session $sessionId: ${e.message}")
        null
    }

    private fun describeDynamics(effect: DynamicsProcessing): String = try {
        val eq = effect.getPreEqByChannelIndex(0)
        (0 until eq.bandCount).joinToString(",") { index ->
            val band = eq.getBand(index)
            String.format(Locale.US, "%.0f:%+.1f", band.cutoffFrequency, band.gain)
        }
    } catch (e: Exception) {
        "?"
    }

    private fun describeEqualizer(effect: Equalizer): String = try {
        (0 until effect.numberOfBands).joinToString(",") { band ->
            val b = band.toShort()
            "${effect.getCenterFreq(b) / 1000}:${effect.getBandLevel(b) / 100.0}"
        }
    } catch (e: Exception) {
        "?"
    }

    companion object {
        private const val TAG = "MPVDialogueBoost"

        /** The two peaking filters of the iOS chain: (centre Hz, Q, gain dB). */
        private val PEAKS = listOf(
            Triple(100.0, 1.2, -6.0),
            Triple(2800.0, 1.2, 5.0),
        )

        private const val LOWEST_HZ = 20.0

        /** Upper edges of half-octave bands from 20 Hz up: 28 Hz ... 20.5 kHz. */
        private val BAND_EDGES_HZ = (1..20).map { LOWEST_HZ * 2.0.pow(it / 2.0) }

        /**
         * Gain in dB of the iOS chain at [hz]: the sum of two peaking EQs
         * (FFmpeg's `equalizer` is the RBJ cookbook peaking filter; well
         * below Nyquist its digital response matches this analog form).
         */
        fun curveDb(hz: Double): Double = PEAKS.sumOf { (centre, q, gainDb) ->
            val a = 10.0.pow(gainDb / 40.0)
            val w = hz / centre
            val real = 1 - w * w
            val numerator = real * real + (w * a / q).pow(2)
            val denominator = real * real + (w / (a * q)).pow(2)
            10 * log10(numerator / denominator)
        }
    }
}
