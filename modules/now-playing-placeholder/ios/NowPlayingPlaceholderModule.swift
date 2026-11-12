import ExpoModulesCore
import MediaPlayer
import UIKit

/**
 * The AirPlay route picker (`AVRoutePickerView`) draws the app's Now Playing
 * artwork and title in its head. While nothing is playing the artwork slot is
 * an empty square, so the cast sheet asks for a placeholder — the app icon
 * and the app name — for as long as it is open, and removes it again on
 * close. Real playback (mpv, the music player) overwrites the whole
 * dictionary, so the placeholder never shadows live metadata; `hide` only
 * clears the center if the placeholder is still what is in it.
 */
public class NowPlayingPlaceholderModule: Module {
  private static let placeholderMarker = "tv.theweasel.nowPlayingPlaceholder"

  public func definition() -> ModuleDefinition {
    Name("NowPlayingPlaceholder")

    AsyncFunction("show") { () -> Bool in
      return await MainActor.run { self.showPlaceholder() }
    }

    AsyncFunction("hide") { () -> Void in
      await MainActor.run { self.hidePlaceholder() }
    }
  }

  @MainActor
  private func showPlaceholder() -> Bool {
    let center = MPNowPlayingInfoCenter.default()
    let current = center.nowPlayingInfo ?? [:]
    // Something is (or was just) playing: leave its metadata alone.
    if !current.isEmpty && current[Self.placeholderMarker] == nil {
      return false
    }
    guard let icon = Self.appIcon() else { return false }

    var info: [String: Any] = [
      Self.placeholderMarker: true,
      MPMediaItemPropertyTitle: Self.appName(),
      MPMediaItemPropertyArtwork: MPMediaItemArtwork(boundsSize: icon.size) { _ in icon },
    ]
    info[MPNowPlayingInfoPropertyPlaybackRate] = 0.0
    center.nowPlayingInfo = info
    return true
  }

  @MainActor
  private func hidePlaceholder() {
    let center = MPNowPlayingInfoCenter.default()
    guard let current = center.nowPlayingInfo, current[Self.placeholderMarker] != nil else {
      return
    }
    center.nowPlayingInfo = nil
  }

  private static func appName() -> String {
    let bundle = Bundle.main
    return (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
      ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String)
      ?? "WeaselPlex"
  }

  /// The largest icon in the bundle's primary icon set, via CFBundleIcons so it
  /// works whatever the asset catalog calls the set; `AppIcon` as a fallback.
  private static func appIcon() -> UIImage? {
    if let icons = Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any],
      let primary = icons["CFBundlePrimaryIcon"] as? [String: Any],
      let files = primary["CFBundleIconFiles"] as? [String],
      let last = files.last,
      let image = UIImage(named: last)
    {
      return image
    }
    return UIImage(named: "AppIcon")
  }
}
