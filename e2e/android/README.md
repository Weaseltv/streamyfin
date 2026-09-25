# Android emulator harness

Drives a release-configuration WeaselPlex APK on an x86_64 emulator on the
ThinkCentre (Linux Android host). Never on the HostMyApple M4 (iOS only, see
`AGENTS.md`).

An emulator run is evidence for behaviour the emulator can reproduce (UI,
navigation, network loss, PiP rejection, memory trends). It is **not** evidence
for anything that depends on real hardware: decoders (the emulator forces
software decode, see `MPVLayerRenderer.isEmulator`), GPU, thermals, real calls,
Bluetooth. Those stay behind a device gate.

## One-time setup

```bash
source ~/android-agent-env.sh
grep -cE 'vmx|svm' /proc/cpuinfo          # > 0, or enable VT-x in the BIOS
$ANDROID_HOME/emulator/emulator -accel-check

# Current Android (1080x2400, 2 GB) already exists: weasel_phone_api36
# Old low-memory phone for memory work:
sdkmanager "system-images;android-29;google_apis;x86_64"
avdmanager create avd -n weasel_lowram_api29 \
  -k "system-images;android-29;google_apis;x86_64" -d pixel_3a
# then in ~/.android/avd/weasel_lowram_api29.avd/config.ini:
#   hw.ramSize=2048  vm.heapSize=256  hw.lcd.density=440  disk.dataPartition.size=6G

curl -Ls https://get.maestro.mobile.dev | bash   # ~/.maestro/bin/maestro
```

## Build, boot, install

```bash
scripts/android/emulator-build.sh            # prints "APK OK — <path>"
scripts/android/emulator-start.sh            # weasel_phone_api36 on emulator-5554
scripts/android/emulator-start.sh weasel_lowram_api29 5556
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk
```

`emulator-build.sh` unsets every release-signing variable and refuses to hand
out an APK that is not signed by `CN=Android Debug`. Only x86_64 native code is
built, so the APK does not run on a phone.

The emulator runs with `-gpu swangle_indirect`. With `swiftshader_indirect`,
libmpv's `gpu-next` renderer aborts on the first frame (libplacebo
`gl_pass_create: assertion "obj.size <= buf_size"`); `-gpu host` needs an X
display.

## Flows

Credentials come from `~/.config/weaselplex-sim/credentials.env` via `run.sh`,
never from a flow file or the command line.

```bash
e2e/android/run.sh e2e/android/login.yaml               # cold start -> signed in
e2e/android/run.sh e2e/android/see-all-back.yaml        # #47 regression
e2e/android/run.sh e2e/android/open-movie.yaml emulator-5554 -- -e MOVIE_TITLE=Unleashed
```

## Things that bit us

- `hideKeyboard` sends Back on Android and leaves the app. Submit with
  `pressKey: Enter` instead.
- The login fields have no hint text in the tree; select them relative to
  their labels (`rightOf: "Password"`, `below: "Username"`).
- Coordinates in screenshots scaled for display are not device pixels. Prefer
  text selectors; when you must tap a point, read the bounds from
  `maestro hierarchy`.
- Jellyfin does not store a resume point under 5 % of the runtime. To test
  resume, set one through the API instead of playing for minutes:
  `POST /UserItems/{itemId}/UserData?userId=…` with
  `{"PlaybackPositionTicks": 12000000000}` (20 min).
- Network loss: `adb shell cmd connectivity airplane-mode enable|disable`.
  Turn it back off afterwards; the next flow will fail otherwise.
- Always look at a screenshot (`adb exec-out screencap -p > shot.png`) rather
  than trusting a green flow.
