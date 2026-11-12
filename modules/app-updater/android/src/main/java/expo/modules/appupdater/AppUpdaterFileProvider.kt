package expo.modules.appupdater

import androidx.core.content.FileProvider

/**
 * Its own class so this provider can't collide with another library's FileProvider entry in
 * the merged manifest. Serves only cache/updates (res/xml/app_updater_paths.xml).
 */
class AppUpdaterFileProvider : FileProvider()
