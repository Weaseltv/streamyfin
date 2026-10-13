# WeaselPlex iPhone / Android parity implementation

The agreed [plan](weaselplex-iphone-android-parity-plan.md) was recovered with owner authorization from the VPS. Its SHA-256 is `60c2bf02959a9798f6200b152ebd4214bb42e74e1e7c7f6723030c367f3d2563`. Implementation, tests and Android builds run on the thread's ThinkCentre (`justin-ThinkCentre-M73`); M4 remains iOS-only. The owner has no physical phones and specified simulator comparisons. The required Check TestFlight and owner merge approval remain separate gates; no device-check waiver has been granted.

## Review stack

Merge only bottom-up toward `weaselfin`, retargeting each remaining layer after its parent merges. All eight PRs stay draft while acceptance is pending.

| Package | PR | Scope |
| --- | --- | --- |
| 1 | [#150](https://github.com/Weaseltv/streamyfin/pull/150) | Query-owned Watchlist state/counts, server/user scope, two-request rails, See all invalidation, bounded scoped refresh |
| 2 | [#151](https://github.com/Weaseltv/streamyfin/pull/151) | Dark Android actions, account/request ownership and visible mutation failures |
| 3 | [#152](https://github.com/Weaseltv/streamyfin/pull/152) | Android See all native header/content inset |
| 4 | [#153](https://github.com/Weaseltv/streamyfin/pull/153) | Measured scrolling header protection and portrait stacking |
| 5 | [#154](https://github.com/Weaseltv/streamyfin/pull/154) | Ready backdrop retention, independent person metadata/credits, missing art and retry |
| 6 | [#155](https://github.com/Weaseltv/streamyfin/pull/155) | Wrapping settings, compact controls, sticky sheet heading, bounded manual refresh |
| 7 | [#156](https://github.com/Weaseltv/streamyfin/pull/156) | Immediate Preparing reservation, cancellable budgets, required selected subtitle, serial batch admission, resume/cleanup and generation-owned native events |
| 8 | [#157](https://github.com/Weaseltv/streamyfin/pull/157) | One Classic session volume source and owned subtitles on mute on both phones |

The bounded-refresh helper is introduced with package 1 and reused by package 6. Portrait stacking is repaired in the shared layout foundation in package 4. Package 8 stays a separate behaviour change. Native iOS behaviour is unchanged. The existing `subtitlesOnMute: true` default and explicit saved false preferences are preserved. **Release notes must mention that existing Android installations gain automatic subtitles on mute.** Turning the setting off removes only a selection owned by the automation; deliberate manual choices remain. Moving to another item while already muted seeds the new session without treating it as a fresh mute transition.

The music artist and playlist routes already reserve `insets.top + 50`, and album reserves `insets.top + 60`, beneath their transparent headers. No geometry change was made without matched simulator measurement.

## Evidence and checks

Original comparison archive SHA-256: `6d74e9e78523bf487cb0f07847994142802deedf8e488c2cee73a300df7dd906`. All 504 PNG hashes and 172 panels were verified. Original baselines are TF 94 exact-source simulator rebuild and Android stable 1.26/code 27; implementation begins from current `origin/weaselfin` at `c3e994fc55a73ca4d995ccb91396f3a3977f0515`. Mismatched query 152, different-item 166, compromised iOS landscape 105 and player captures with a keyboard are excluded until matched recapture.

Local evidence: `/home/justin/.t3/artifacts/weaselplex-parity-implementation-2026-10-13/`. `pr-stack.json` records exact PR commit refs; `layer-validation.json` and per-layer logs record TypeScript, unit, isolated asset I/O and both production Hermes exports. The Android build log and TestFlight run receipts are recorded separately. These are compile/state checks, not authenticated screenshot or hardware acceptance.

Claude Opus 5.5 at medium reasoning reviewed preparation, design and successive implementation amendments through round 8. Reviews repaired cache settlement/rail restart, stale slideshow identity, indefinite offline mutations/refresh, required-subtitle isolation, batch preparation order, resumable partial ownership, next-episode subtitle preference and mute/unmute native acknowledgement races. Final static reviews had no Critical/High/Medium findings; remaining low cleanup/native compatibility findings were repaired and tested.

A separate before-source regression reproduced both new queues failing on React Native's actual AbortSignal, which has no `throwIfAborted()` or `reason`. Production now checks `aborted` explicitly and retains operation/child cancellation reasons. Favourite queue tests use `abort-controller/dist/abort-controller`; `bun utils/integration/downloadAssets.check.ts` uses that same phone controller and isolated native filesystem mocks. It checks required subtitle 403, optional stall preserving the chosen file, immutable cached metadata, cancellation and late native file cleanup. Run it separately to prevent mock leakage into the unit suite. Bun/native DOMException and timeout-reason regressions cover the generic cancellation helper.

The baseline x86_64 release-configuration emulator APK compiled on ThinkCentre with executable NDK 29.0.14206865. An isolated debug package (`tv.theweasel.weaselplex.phone.parity`) retains the production-signed stable app. Temporary baseline bundling overrides are removed before the changed-source build. No Kotlin/JNI change is included.

## Outstanding acceptance and release gates

- Saved Free T simulator credentials return 401. Owner Quick Connect approval is pending. Signed-in before/after captures and live Jellyfin 12.2 Persons `TotalRecordCount` semantics with `limit=1` remain unverified.
- The original iOS simulator download root cause remains unverified. Preparation handling is repaired and tested; no conditional native iOS root-cause patch is claimed.
- Every implementation PR requires its PR-branch Check TestFlight on M4. Initial run [38359982783](https://github.com/Weaseltv/weaseltv-apps/actions/runs/38359982783) was cancelled because its source preceded the native AbortSignal repair; it is not acceptance evidence. Replacement run links and build numbers belong in the PRs and Ops record.
- Owner iPhone OK or an explicit device-check waiver is required before merge. Simulator-only comparison does not supply that approval. No publication is authorized by this plan.
- Making the Android native compile workflow a required branch-protection check remains open admin work, as documented in AGENTS.md; no Kotlin/JNI edits were made here.

Existing Product rows and the [Ops implementation record](https://app.notion.com/p/3f8abaa146c08125bb7cf3dcafa54b78) track progress and gates. Both workers' main checkouts were refreshed through GitHub. Re-run the machine sync after the final push, remove owned Android/temporary validation outputs and emulator APKs, and run both M4 product pruners after validation. Keep original evidence and signed release evidence.
