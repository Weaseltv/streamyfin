# Android phone player portrait layout

## Scope and reproduction

Investigated on the ThinkCentre from `f4d3b05c`, using the published
WeaselPlex 1.10 / versionCode 11 APK, then a release-configuration x86_64
build with bundled, optimized Hermes bytecode. Test APKs use the debug
signing key and are not phone releases.

The owner's phone model and Android version are unknown. The owner believes
it uses three-button navigation. Its reported first-open clipping, repaired
by rotating to landscape and back, **was not reproduced on these emulators**.
This change must not be described as a confirmed fix on that phone.

The ADB targets were explicitly selected:

- `emulator-5556`: `weasel_lowram_api29`, Android 10, 2 GB, 1080 × 2220,
  density 440 (2.75 px/dp).
- `emulator-5558`: a read-only instance of `weasel_phone_api36`, Android 16,
  2 GB, 1080 × 2400, density 420 (2.625 px/dp).

The other worker's emulator and the attached Shield were not used. The
read-only modern AVD preserves the other worker's saved state.

## Measured cause of the related overlap

On API 29 with three-button navigation and safe area enabled:

- Window, React player root, controls overlay, MPV ExpoView and SurfaceView
  all fill **1080 × 2220** on first portrait entry and after the settled
  landscape → portrait cycle. No stale native child bounds were observed.
- The bottom safe-area allowance is 132 px / 48 dp. The old calculation,
  `max(insets.bottom - 17, 0)`, positions the bottom group 85 px / 31 dp
  above the window bottom.
- The time text occupies **y = 2067…2114**. The navigation-bar area starts
  at **y = 2088**, so **26 px of the row overlaps that area** when the bar
  is revealed. The group's existing inner bottom margin is only 8 dp.
- Hiding controls removes the title, seek bar and time text. The detail
  screen does not show through; the black regions around video are normal
  letterboxing.

API 36 also had matching full-window bounds on first entry and after
rotation. Its hidden-bar safe-area bottom inset becomes zero. Swiping to
reveal transient system bars can overlay edge controls; this is separate
from the reported persistent first-open failure.

The supported correction is confined to Android phone bottom spacing:
use the full inset, retaining the existing 8 dp inner margin. The safe-area
preference still controls whether the inset is applied. iOS retains its
existing calculation, and TV uses its separate controls component.

No surface-layout flag, viewport resize, orientation change, timer, player
remount or engine change is justified by these measurements.

## Result

With the patch, API 29's time row moves from **y = 2067…2114** to
**y = 2020…2067**, a 47 px (17 dp) shift. It clears the navigation-bar area
by 21 px. First entry and the settled return from rotation have identical
bounds. API 36 retains **y = 2334…2379** while its bottom inset is zero.

The [baseline probe trace](evidence/android-player-portrait/baseline-measurements.txt)
shows the inset changing from bottom 48 dp to right 48 dp in landscape,
then returning to bottom 48 dp. The React root and controls track the
window in both orientations. All probes were removed from the final code.

## Before evidence

- [API 29 first portrait](evidence/android-player-portrait/api29-before-portrait.png)
- [API 29 after rotation and settling](evidence/android-player-portrait/api29-before-return.png)
- [API 29 controls with the navigation bar revealed](evidence/android-player-portrait/api29-before-bars.png)
- [API 36 episode first portrait](evidence/android-player-portrait/api36-before-portrait.png)

## After evidence

- [API 29 first portrait](evidence/android-player-portrait/api29-after-portrait.png)
- [API 29 navigation bar revealed](evidence/android-player-portrait/api29-after-bars.png)
- [API 29 return from rotation](evidence/android-player-portrait/api29-after-return.png)
- [API 29 gesture navigation / next episode](evidence/android-player-portrait/api29-after-gesture-next-episode.png)
- [API 29 error screen](evidence/android-player-portrait/api29-error.png)
- [API 36 movie portrait](evidence/android-player-portrait/api36-after-portrait.png)
- [API 36 gesture navigation / episode](evidence/android-player-portrait/api36-after-gesture-episode.png)
- [API 36 next episode](evidence/android-player-portrait/api36-after-next-episode.png)
- [Native bounds, before and after](evidence/android-player-portrait/native-bounds.txt)

Some captures pause during black opening frames or buffering to inspect the
controls. Movie and episode frames were also observed during playback.
These are layout checks, not decoder performance or uninterrupted playback tests.

## Validation

### Build and checks

- Final x86_64 release-configuration APK: `BUILD SUCCESSFUL in 4m 19s`.
  SDK/NDK variables were exported and `test -x "$ANDROID_NDK_HOME/ndk-build"`
  passed before Gradle. Command after prebuild:
  `NODE_ENV=production ./gradlew :app:assembleRelease --no-daemon --console=plain -PreactNativeArchitectures=x86_64 --max-workers=1`.
- The APK uses bundled optimized Hermes bytecode and the Android debug
  certificate; version remains 1.10 / 11. SHA-256:
  `aa4b402711749a4816faf94193363c21755912d4d40e4bc532999cc9b3df2fa4`.
- `bun run typecheck`: passed with the repository's existing Jellyseerr
  exclusions.
- `bun run test:unit`: 200 passed, 0 failed (19 files, 372 assertions).
- `bun run check`: passed, 767 files, no fixes applied.
- `bun run i18n:check`: fails on two existing unused keys,
  `home.settings.other.show_custom_menu_links_hint` and
  `library.libraries_count`. Confirmed the same result on base `f4d3b05c`.
  No missing keys.
- `bun run doctor`: 19/20 passed; the dependency-version check reports 33
  Expo packages behind the current patch recommendations. Package files
  and lockfile are unchanged by this PR.
- Two earlier diagnostic build attempts failed (Gradle daemon disappeared;
  another process exited 143). A tracked background build then completed
  successfully, followed by the successful final build above.
- The final diff has no Kotlin/JNI changes. The PR's Android compile workflow
  remains the CI check; the repository's recommendation to require that
  status through branch protection remains open.

### Emulator cases

| Case | API 29 | API 36 |
| --- | --- | --- |
| Cold and warm portrait movie opens, close/reopen | Checked; time row stays above the inset | Checked; full window, readable controls |
| Episode and next-episode button | Checked with gesture navigation; S1:E1 → S1:E2 | Checked with gesture navigation; S1:E1 → S1:E2 |
| Portrait → landscape → portrait | Root, overlay and surface follow the window; original portrait bounds restored | Same |
| Controls shown/hidden | Text disappears with controls; no detail bleed-through | Same |
| Three-button and gesture navigation | Both checked | Both checked |
| Safe area on/off | Checked: time row ends at y=2067 on, y=2199 off with three-button navigation; preference restored | Default on checked; off not repeated |
| Loading, error, Retry, Close | Opaque full-window loader/error; a nonexistent item shows Retry/Close; Retry returns to the same error, Close exits | Loading checked; error/retry not repeated |
| PiP return and background/foreground | Return to 1080 × 2220 with the corrected time-row bounds | Not repeated |

Retry used a nonexistent item, so recovery after a network outage was not
validated. PiP's small video image was cropped during the API 29 run; only
the return to the normal player layout was verified. Playback continuity
through those transitions is not certified by this change.

## Limits

Emulators use software decoding and software graphics. They do not validate
the affected phone's GPU, decoder, display cutouts, rounded screen edges or
vendor fullscreen behavior. No iPhone/TestFlight run, merge, tag or release
publication is part of this task.
