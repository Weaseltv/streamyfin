# AGENTS.md — WeaselPlex mobile (`streamyfin` / weaselfin)

> Standing process for agents in this WeaselTV fork.

## Product

This repo is the **WeaselPlex Android Phone + iOS** Product (Streamyfin fork). It is **not** WeaselTV IPTV (`weaseltv-apps`). Ship / default WeaselPlex branch for both phone and iOS is **`weaselfin`** (do not treat upstream `develop` as the ship branch). Website/portal work belongs in `weaseltv-platform`. Do not invent new Products.

## Notion Command Center (required before finish)

Source of truth: https://app.notion.com/p/3daabaa146c081939b55f7b4ba9f6af8

Before finishing any job: update the matching **Product** row (and Ops log if big). Never create a new Product for a session. If Notion tools are unavailable, report the exact updates the owner should make — do not silently skip.

Also see `CLAUDE.md` for Claude Code project guidance.

## iOS ship workflow (default)

Unless the owner explicitly asks for a **Release** build, use:

**Branch -> commit -> PR -> check TestFlight from the PR branch -> owner on-device OK -> merge -> tag -> release publish from main/ship branch only if a tagged release is needed.**

- Default target / ship branch for **WeaselPlex** work in this repo: `weaselfin` (not upstream `develop`).
- **Check TestFlight** from the PR branch is required before merge for iOS changes the owner will verify on iPhone.
- Do not merge before owner OK unless they waive device check.
- An official **Release** TestFlight comes from a tag after merge, and only when the owner asks for a Release or a tagged release is needed.
- Android phone changes follow: merge -> tag -> build signed APK on T3 VPS or ThinkCentre (WeaselFin keystore) -> publish **weaselplex-phone / stable only** via weaseltv-platform direct-distribution (no Beta agent path; no pre-merge device gate). Source `~/android-agent-env.sh` for manifest signing (`WEASELTV_SIGNING_*`); see `~/agent-docs/android-phone-publish.md`. Forever command (owner-asked only): `source ~/android-agent-env.sh && CONFIRM=PUBLISH_ANDROID_PHONE_STABLE ANDROID_PHONE_RELEASE_NOTES_FILE=notes.txt ~/agent-docs/bin/publish-android-phone-stable.sh weaselplex /path/to/signed.apk` (see `~/agent-docs/android-phone-publish.md`). The notes are shown to users in the app's update popup: first line a one-sentence summary, then one line per change, written like the WeaselPlex TV release text. The script refuses placeholders.

## Publishing to theweasel.tv: releases only, never the pages (added 2026-09-30)

On 2026-09-26 and 2026-09-28 a phone publish deployed a stale copy of the download pages. That
reverted the owner-approved `/apps`, `/tv`, `/phone`, `/signal-check` and `/weaselplex`
redesign, put the retired rainbow logo back, and republished the retired Android phone Beta.
The same publish path serves WeaselPlex, so these rules apply here too.

- **A publish changes only the release:** the new APK, its signed channel pointer, the ledger
  entry and the permanent alias (`weaselplex.apk` for WeaselPlex). Nothing else.
- **The download pages belong to weaseltv-platform.** They live in
  `ops/direct-distribution/public/` on its `main` branch. Never edit, copy or deploy the pages
  from the operator archive, the other worker's archive (ThinkCentre or VPS) or an old checkout.
  A page change is a weaseltv-platform pull request that the owner approves.
- **Use the publish script as-is.** `~/agent-docs/bin/publish-android-phone-stable.sh` refuses
  unless `~/work/weaseltv/weaseltv-platform` is a clean checkout of `origin/main`. It refreshes
  the pages from that checkout before deploying, and it refuses if a phone Beta channel file
  exists. Never bypass a refusal, hand-run `Deploy-Distribution.ps1` with your own page copy,
  or deploy from another checkout. Fix the cause, or ask the owner.
- **Never bring back retired channels.** The Android phone Beta was retired on 2026-09-26 and
  must never be published. If a `sync-operator-archive.sh pull` restores
  `releases/android-phone/channels/beta.json`, move it to
  `private-evidence/retired-channels/` and tell the owner.
- **Keep every current build published.** Before deploying, compare the staged
  `releases/*/channels/*.json` with what's live (WeaselTV phone, WeaselPlex phone and
  WeaselTV TV), so nothing current is dropped. After deploying, check that
  `https://theweasel.tv/apps` still shows the current Neon Board pages (no rainbow logo),
  with WeaselTV for TV and WeaselCheck marked "Coming soon" until the owner launches them.
- **After a publish on one worker, run `sync-operator-archive.sh push`** so the other worker
  doesn't keep a stale copy.
- **Report what you published:** product, versionName, versionCode and the deployment id.

## Machine roles (hard rule)

- **HostMyApple M4 = iOS only.** Xcode, Simulator, TestFlight upload. **Never** the Android SDK/NDK, never `expo prebuild --platform android`, never Gradle for WeaselPlex Android. Do not add Android steps to any M4 workflow.
- **T3 VPS (`srv1160496`) and ThinkCentre = WeaselPlex Android** compile, `expo prebuild --platform android`, Gradle. Both must stay capable; any Android toolchain step added on one must be documented so the other can mirror it. Both carry: Android SDK at `~/Android/Sdk`, **NDK 29.0.14206865**, cmake 3.22.1, with `ANDROID_HOME`/`ANDROID_SDK_ROOT`/`ANDROID_NDK_HOME`/`ANDROID_NDK_ROOT` exported in `~/.bashrc` (interactive shells only — scripts must export their own; `scripts/android/compile-check.sh` does).
- Before claiming an Android compile ran anywhere: `test -x "$ANDROID_NDK_HOME/ndk-build"`.

## Android compile gate (required)

- **Never merge an Android-native WeaselPlex change (Kotlin/JNI under `modules/*/android`) without a green compile.** Either the `WeaselPlex Android compile check` workflow (`.github/workflows/weaselplex-android-check.yml`, hosted Linux runner, runs on every PR to `weaselfin`) is green on the PR, or an equivalent local compile ran on the VPS/ThinkCentre via `bun run android:compile-check` and its `COMPILE OK` line is quoted in the PR.
- The gate is `expo prebuild --platform android` → `./gradlew compileReleaseKotlin` across every project. Green means it compiles; it is not a device test. There is still no pre-merge Android device gate.
- Shared TypeScript ships to Android in the same build as iOS; only native changes need this gate.
- **Recommended (admin setting, not yet applied):** make the check `Compile Android Kotlin (app + native modules)` a **required status check** on `weaselfin` via branch protection. Until then the gate is advisory — it reports red/green on every PR but does not block a merge — and the never-merge-unbuilt rule is enforced by this file and reviewer discipline alone. Do not block merges on this being flipped; do record it as open.

## Android error-reporting policy

- Android's pinned `dev.jdtech.mpv:libmpv` delivers `event(int)` with **no end-file reason**. Playback-failure reporting on Android is therefore a **heuristic first**: an `END_FILE` while the renderer is still active and far from the duration is reported as a failure with reason `unknown`, which drives the same Retry/Close UI as iOS. A JNI fork of libmpv to carry real end-file reasons is a **later, explicit, owner-approved project** — do not start it as part of another task.

## M4 disk hygiene

WeaselPlex iOS TestFlight/validation on HostMyApple must keep >= 20 GB free. Before and after M4 work, run the weaseltv-apps pruners against `~/CodexRuns/weaselplex-ios` (see weaseltv-apps `AGENTS.md` "M4 disk hygiene"). Do not leave multi-GB `derived-data-release` roots behind.

