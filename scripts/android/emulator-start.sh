#!/usr/bin/env bash
# Boot a headless WeaselPlex test emulator on the ThinkCentre and wait for it.
#
# Usage: scripts/android/emulator-start.sh [avd] [port]
#   avd   default weasel_phone_api36 (current Android); use weasel_lowram_api29
#         for memory work (2 GB, API 29, see e2e/android/README.md)
#   port  console port, default 5554 -> serial emulator-5554
#
# GPU: swangle_indirect (ANGLE on SwiftShader). The older swiftshader_indirect
# GL path aborts libmpv's gpu-next renderer on the first video frame
# (libplacebo gl_pass_create: assertion "obj.size <= buf_size"), and -gpu host
# needs an X display this headless box does not have. That abort is an
# emulator GL limitation, not evidence about real phones.
set -euo pipefail

AVD="${1:-weasel_phone_api36}"
PORT="${2:-5554}"
SERIAL="emulator-$PORT"

if [ -f "$HOME/android-agent-env.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/android-agent-env.sh"
fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"

if adb devices | grep -q "^$SERIAL"; then
  echo "$SERIAL already running"
  exit 0
fi

nohup emulator -avd "$AVD" -port "$PORT" -no-window -no-audio \
  -gpu swangle_indirect -no-snapshot-save >"/tmp/emulator-$AVD.log" 2>&1 &

timeout 300 adb -s "$SERIAL" wait-for-device
timeout 300 adb -s "$SERIAL" shell \
  'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 1; done'
echo "$SERIAL ($AVD) booted — log /tmp/emulator-$AVD.log"
