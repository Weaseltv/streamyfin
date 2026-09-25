package expo.modules.backgrounddownloader

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class DownloadService : Service() {
  private val TAG = "DownloadService"
  private val NOTIFICATION_ID = 1001
  private val CHANNEL_ID = "download_channel"

  private val binder = DownloadServiceBinder()
  private var activeDownloadCount = 0
  private var currentDownloadTitle = "Preparing download..."
  private var currentProgress = 0
  private var isForegroundStarted = false
  private var wakeLock: PowerManager.WakeLock? = null

  inner class DownloadServiceBinder : Binder() {
    fun getService(): DownloadService = this@DownloadService
  }

  override fun onCreate() {
    super.onCreate()
    Log.d(TAG, "DownloadService created")
    createNotificationChannel()

    val pm = getSystemService(PowerManager::class.java)
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Streamyfin::DownloadWakeLock")
    wakeLock?.acquire()

    Log.d(TAG, "Wake lock acquired")
  }

  override fun onBind(intent: Intent?): IBinder {
    Log.d(TAG, "DownloadService bound")
    return binder
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    Log.d(TAG, "DownloadService started")

    // Always promote to foreground: the module starts this service with
    // startForegroundService(), and a service started that way that never
    // calls startForeground() is an ANR ("did not then call
    // Service.startForeground()"). The previous "boot context" guard skipped
    // it whenever the device had been up for less than ten minutes, so every
    // download started soon after a reboot on Android 15+ froze the app
    // (reproduced on the API 36 emulator). Where the system does refuse a
    // dataSync foreground service, startForegroundSafely() catches it and
    // stops the service.
    startForegroundSafely()

    // Not sticky: a system restart of this service carries no downloads
    // (they live in the module and JS re-enqueues pending ones on launch),
    // and being restarted after boot is the context Android 15 forbids for
    // dataSync services.
    return START_NOT_STICKY
  }

  /**
   * Start foreground service safely with proper service type for Android 14+
   */
  private fun startForegroundSafely() {
    if (isForegroundStarted) return

    try {
      if (Build.VERSION.SDK_INT >= 34) {
        ServiceCompat.startForeground(
          this,
          NOTIFICATION_ID,
          createNotification(),
          ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        )
      } else {
        startForeground(NOTIFICATION_ID, createNotification())
      }
      isForegroundStarted = true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start foreground service", e)
      // If we can't start foreground, stop the service
      stopSelf()
    }
  }
  
  override fun onDestroy() {
    wakeLock?.let { if (it.isHeld) it.release() }
    Log.d(TAG, "Wake lock released")
    Log.d(TAG, "DownloadService destroyed")
    super.onDestroy()
  }
  
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Downloads",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Video download progress"
        setShowBadge(false)
      }
      
      val notificationManager = getSystemService(NotificationManager::class.java)
      notificationManager.createNotificationChannel(channel)
    }
  }
  
  private fun createNotification(): Notification {
    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(currentDownloadTitle)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
    
    if (currentProgress > 0) {
      builder.setProgress(100, currentProgress, false)
        .setContentText("$currentProgress% complete")
    } else {
      builder.setProgress(100, 0, true)
        .setContentText("Starting...")
    }
    
    return builder.build()
  }
  
  fun startDownload() {
    activeDownloadCount++
    Log.d(TAG, "Download started, active count: $activeDownloadCount")
    if (activeDownloadCount == 1) {
      startForegroundSafely()
    }
  }
  
  fun stopDownload() {
    activeDownloadCount = maxOf(0, activeDownloadCount - 1)
    Log.d(TAG, "Download stopped, active count: $activeDownloadCount")
    if (activeDownloadCount == 0) {
      if (isForegroundStarted) {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        isForegroundStarted = false
      }
      stopSelf()
    }
  }
  
  fun updateProgress(title: String, progress: Int) {
    currentDownloadTitle = title
    currentProgress = progress
    
    val notificationManager = getSystemService(NotificationManager::class.java)
    notificationManager.notify(NOTIFICATION_ID, createNotification())
  }
}


