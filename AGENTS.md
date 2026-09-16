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
- Android phone changes follow: merge -> tag -> build signed APK on T3 VPS or ThinkCentre (WeaselFin keystore) -> publish **weaselplex-phone / stable only** via weaseltv-platform direct-distribution (no Beta agent path; no pre-merge device gate). Source `~/android-agent-env.sh` for manifest signing (`WEASELTV_SIGNING_*`); see `~/agent-docs/android-phone-publish.md`. Forever command (owner-asked only): `source ~/android-agent-env.sh && CONFIRM=PUBLISH_ANDROID_PHONE_STABLE ~/agent-docs/bin/publish-android-phone-stable.sh weaselplex /path/to/signed.apk` (see `~/agent-docs/android-phone-publish.md`).

## M4 disk hygiene

WeaselPlex iOS TestFlight/validation on HostMyApple must keep >= 20 GB free. Before and after M4 work, run the weaseltv-apps pruners against `~/CodexRuns/weaselplex-ios` (see weaseltv-apps `AGENTS.md` "M4 disk hygiene"). Do not leave multi-GB `derived-data-release` roots behind.

