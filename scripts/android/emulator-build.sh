#!/usr/bin/env bash
# WeaselPlex Android emulator build: an installable release-configuration APK
# (JS bundled, no Metro) for the x86_64 emulator on the ThinkCentre.
#
# Linux Android hosts only (ThinkCentre, T3 VPS). NEVER on the HostMyApple M4,
# which is iOS-only (see AGENTS.md "Machine roles").
#
# The APK is signed with the DEBUG keystore on purpose. ~/android-agent-env.sh
# exports the real WeaselTV release signing material; an emulator test APK must
# never carry it, so this script unsets every signing variable and then checks
# the signer of the finished APK before printing its path.
#
# Usage: scripts/android/emulator-build.sh [--install] [--abi x86_64]
#   --install   adb install -r the APK on the single running emulator/device
#   --abi       ABI to build native code for (default x86_64; emulator only)
set -euo pipefail

INSTALL=0
ABI=x86_64
while [ $# -gt 0 ]; do
  case "$1" in
    --install) INSTALL=1 ;;
    --abi) ABI="$2"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
  shift
done

if [ -f "$HOME/android-agent-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/android-agent-env.sh"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
NDK_VERSION="${ANDROID_NDK_VERSION:-29.0.14206865}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/$NDK_VERSION}"
export ANDROID_NDK_ROOT="$ANDROID_NDK_HOME"
export PATH="$PATH:$HOME/.bun/bin:$ANDROID_HOME/platform-tools"

if ! test -x "$ANDROID_NDK_HOME/ndk-build"; then
  echo "NDK not found at $ANDROID_NDK_HOME — refusing to build." >&2
  exit 2
fi

# Never let the release signing material near an emulator build.
unset WEASELFIN_SIGNING_PROPS WEASELTV_SIGNING_PROPERTIES WEASELTV_SIGNING_KEY_ALIAS \
  WEASELTV_SIGNING_KEY_PASSWORD WEASELTV_SIGNING_STORE_PASSWORD

cd "$(git rev-parse --show-toplevel)"
echo "emulator build: $(git branch --show-current) @ $(git rev-parse --short HEAD) on $(hostname), abi=$ABI"

[ -d node_modules ] || bun i --frozen-lockfile

# android/ is gitignored; prebuild regenerates it from app.json.
EXPO_TV=0 CI=1 bunx expo prebuild --platform android --no-install

# The template's 4 GB heap plus two emulators overran the ThinkCentre's 15 GB
# and the kernel OOM-killed Gradle. GRADLE_HEAP overrides.
sed -i -E "s/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx${GRADLE_HEAP:-2560m} -XX:MaxMetaspaceSize=768m/" android/gradle.properties

(
  cd android
  # Two emulators (~5 GB) plus an uncapped build overran the ThinkCentre's
  # 15 GB and the kernel OOM-killed Gradle. GRADLE_HEAP / GRADLE_WORKERS
  # override the caps.
  NODE_ENV=production ./gradlew assembleRelease --no-daemon --console=plain \
    -PreactNativeArchitectures="$ABI" \
    --max-workers="${GRADLE_WORKERS:-4}"
)

APK=android/app/build/outputs/apk/release/app-release.apk
# Proof by artifact, not exit code: the APK must exist and be fresh.
if ! [ -f "$APK" ] || [ -n "$(find "$APK" -mmin +30)" ]; then
  echo "no fresh APK at $APK — the build did not produce one." >&2
  exit 3
fi

APKSIGNER="$(ls -d "$ANDROID_HOME"/build-tools/*/apksigner | sort -V | tail -1)"
SIGNER="$("$APKSIGNER" verify --print-certs "$APK" | grep -m1 'certificate DN')"
echo "$SIGNER"
if ! grep -q "CN=Android Debug" <<<"$SIGNER"; then
  echo "APK is not signed with the debug keystore — refusing to hand it out." >&2
  exit 4
fi

echo "APK OK — $APK ($(du -h "$APK" | cut -f1))"

if [ "$INSTALL" = 1 ]; then
  adb install -r "$APK"
fi
