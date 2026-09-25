package expo.modules.mpvplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * The audio-focus owner for one video player (R29).
 *
 * Before this the mpv player never asked for audio focus, so a phone call, an
 * alarm, another app's music or TrackPlayer's own music had no defined effect
 * on video, and unplugging headphones kept playing out of the speaker.
 *
 * - [onPlay] requests focus. If the system refuses (another app holds it, or
 *   Android 15's rule for apps that are neither on top nor running a media
 *   foreground service), playback is paused instead of fighting for it.
 * - Permanent loss pauses. Transient loss (a call, a navigation prompt)
 *   pauses and resumes when focus comes back, but only if the user had not
 *   paused or resumed by hand in between. "Can duck" losses are left to the
 *   system's automatic ducking (setWillPauseWhenDucked(false)).
 * - Headphones or a Bluetooth route going away (ACTION_AUDIO_BECOMING_NOISY)
 *   pauses.
 * - [release] abandons focus; called when the player stops or is torn down.
 *
 * All methods run on the main thread; the focus listener is delivered there.
 */
class AudioFocusController(context: Context, private val delegate: Delegate) {

    interface Delegate {
        /** Pause because of focus or route change; not a user action. */
        fun onFocusPause()
        /** Resume after a transient loss that paused playback. */
        fun onFocusResume()
        /** Whether video is playing right now (not paused by the user). */
        fun isPlaying(): Boolean
    }

    companion object {
        private const val TAG = "AudioFocusController"
    }

    private val appContext = context.applicationContext
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var hasFocus = false
    /** Set when a transient loss paused a playing video. */
    private var resumeOnGain = false
    private var noisyRegistered = false

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        mainHandler.post { onFocusChange(change) }
    }

    private val focusRequest: AudioFocusRequest? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                        .build()
                )
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(focusListener, mainHandler)
                .build()
        } else {
            null
        }

    private val noisyReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                Log.i(TAG, "Audio becoming noisy: pausing")
                resumeOnGain = false
                delegate.onFocusPause()
            }
        }
    }

    /**
     * The user (or autoplay) started playback. Returns false if focus was
     * refused; the caller should then stay paused.
     */
    fun onPlay(): Boolean {
        resumeOnGain = false
        registerNoisy()
        if (hasFocus) return true
        val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.requestAudioFocus(focusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
        }
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        Log.i(TAG, "Audio focus request: ${if (hasFocus) "granted" else "refused ($result)"}")
        return hasFocus
    }

    /** The user paused. Keep focus so a quick resume does not re-request it. */
    fun onUserPause() {
        resumeOnGain = false
    }

    /** Playback is over for this player: give focus back, stop listening. */
    fun release() {
        resumeOnGain = false
        unregisterNoisy()
        if (!hasFocus) return
        hasFocus = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.abandonAudioFocusRequest(focusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(focusListener)
        }
        Log.i(TAG, "Audio focus abandoned")
    }

    private fun onFocusChange(change: Int) {
        Log.i(TAG, "Audio focus change: $change")
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS -> {
                // Another app took over for good (music, another video).
                // Pause and let the user decide; do not resume on our own.
                hasFocus = false
                resumeOnGain = false
                unregisterNoisy()
                delegate.onFocusPause()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                // A call, an alarm, a voice prompt.
                resumeOnGain = delegate.isPlaying()
                if (resumeOnGain) delegate.onFocusPause()
            }
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                // The system ducks us (setWillPauseWhenDucked(false)).
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                hasFocus = true
                if (resumeOnGain) {
                    resumeOnGain = false
                    delegate.onFocusResume()
                }
            }
        }
    }

    private fun registerNoisy() {
        if (noisyRegistered) return
        appContext.registerReceiver(noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
        noisyRegistered = true
    }

    private fun unregisterNoisy() {
        if (!noisyRegistered) return
        try {
            appContext.unregisterReceiver(noisyReceiver)
        } catch (_: Exception) {}
        noisyRegistered = false
    }
}
