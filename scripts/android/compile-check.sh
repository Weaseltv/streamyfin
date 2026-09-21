#!/usr/bin/env bash
# WeaselPlex Android compile check — the local twin of
# .github/workflows/weaselplex-android-check.yml.
#
# Runs on the T3 VPS or the ThinkCentre. NEVER on the HostMyApple M4, which is
# iOS-only (see AGENTS.md "Machine roles"). Both Linux hosts carry the same
# toolchain: Android SDK at ~/Android/Sdk, NDK 29.0.14206865, cmake 3.22.1,
# with ANDROID_* exports in ~/.bashrc. ~/.bashrc returns early for
# non-interactive shells, so this script sets what it needs itself.
#
# Green means the Kotlin under modules/*/android compiles against the real
# Expo/RN project. It is not a device test. No signing, no APK, no publish.
set -euo pipefail

# Shared Android env (SDK path, PATH, mise). Present on both Linux hosts.
if [ -f "$HOME/android-agent-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/android-agent-env.sh"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
NDK_VERSION="${ANDROID_NDK_VERSION:-29.0.14206865}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$ANDROID_HOME/ndk/$NDK_VERSION}"
export ANDROID_NDK_ROOT="$ANDROID_NDK_HOME"
export PATH="$PATH:$HOME/.bun/bin"

# The owner's rule: verify the NDK before claiming a compile ran.
if ! test -x "$ANDROID_NDK_HOME/ndk-build"; then
  echo "NDK not found at $ANDROID_NDK_HOME — refusing to claim a compile." >&2
  exit 2
fi

cd "$(git rev-parse --show-toplevel)"
echo "compile check: $(git branch --show-current) @ $(git rev-parse --short HEAD) on $(hostname)"
echo "NDK: $ANDROID_NDK_HOME"

# android/ is gitignored; prebuild regenerates it from app.json.
EXPO_TV=0 CI=1 bunx expo prebuild --platform android --no-install

( cd android && ./gradlew compileReleaseKotlin --no-daemon --console=plain )

echo "COMPILE OK — $(git rev-parse --short HEAD) on $(hostname)"
