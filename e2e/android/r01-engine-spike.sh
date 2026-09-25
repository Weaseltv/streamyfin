#!/usr/bin/env bash
# R01 spike: from an item page, tap Play, wait for mpv to start, play PLAY
# seconds, Back, wait for the item page, then record PSS, native heap and
# thread counts (mpv Lua/demux/decoder threads by name). CSV on stdout.
# usage: r01-engine-spike.sh <serial> <cycles> [play_secs] [mode]   mode: normal|backearly
# Needs a debuggable-enough device: /proc/<pid>/task/*/comm must be readable.
S=$1; N=$2; PLAY=${3:-10}; MODE=${4:-normal}
source ~/android-agent-env.sh
A="adb -s $S"; PKG=tv.theweasel.weaselplex.phone
ITEM=${ITEM:-fbe82eab68e44a41c7c996d69afea51e}; TITLE=${TITLE:-4 FOR TEXAS}
screen() { $A shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; $A shell cat /sdcard/ui.xml 2>/dev/null; }
on_page() { screen | grep -q "text=\"$TITLE\""; }
ensure_page() {
  on_page && return 0
  $A shell am start -a android.intent.action.VIEW -d "\"weaselfin:///(auth)/(tabs)/(home)/items/page?id=$ITEM\"" $PKG >/dev/null 2>&1
  for _ in $(seq 1 20); do sleep 1; on_page && return 0; done; return 1
}
starts() { $A logcat -d | grep -c "MPV renderer started"; }
measure() {
  local pid=$($A shell pidof $PKG | tr -d '\r')
  [ -z "$pid" ] && { echo "$1,DEAD,,,,,,,,$2,$3"; return; }
  local mi=$($A shell dumpsys meminfo $PKG)
  local total=$(echo "$mi" | awk '/TOTAL:/{print $2; exit}')
  local native=$(echo "$mi" | awk '/Native Heap:/{print $3; exit}')
  local comms=$($A shell "cat /proc/$pid/task/*/comm" 2>/dev/null)
  echo "$1,$pid,$total,$native,$(echo "$comms" | wc -l),$(echo "$comms" | grep -c '^lua/'),$(echo "$comms" | grep -c '^demux'),$(echo "$comms" | grep -c '^av:'),$(echo "$comms" | grep -c '^ao/'),$2,$3"
}
echo "cycle,pid,pss_total_kb,native_heap_kb,threads,lua_threads,demux_threads,decoder_threads,ao_threads,start_ok,close_ms"
ensure_page; sleep 3; measure 0 - -
for i in $(seq 1 $N); do
  ensure_page || { echo "$i,NOPAGE"; continue; }
  before=$(starts)
  bounds=$(screen | grep -o 'content-desc="Play button"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | grep -oE '\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]')
  x=$(echo "$bounds" | sed -E 's/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/\1 \3/' | awk '{print int(($1+$2)/2)}')
  y=$(echo "$bounds" | sed -E 's/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/\2 \4/' | awk '{print int(($1+$2)/2)}')
  $A shell input tap ${x:-450} ${y:-1018}
  ok=0; for _ in $(seq 1 30); do sleep 1; [ "$(starts)" -gt "$before" ] && { ok=1; break; }; done
  if [ "$MODE" = backearly ]; then sleep 1; else sleep $PLAY; fi
  t0=$(date +%s%N); $A shell input keyevent BACK
  for _ in $(seq 1 40); do on_page && break; sleep 0.5; done
  ms=$(( ($(date +%s%N)-t0)/1000000 ))
  sleep 3
  measure $i $ok $ms
done
