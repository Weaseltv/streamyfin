# WeaselPlex iPhone and Android parity implementation plan

Fix Watchlist query state, the Android item action sheet, content hidden behind the See all header, and scrolling header readability first. Restore the missing iOS person portrait and make backdrop rotation wait for ready artwork. Add subtitles on mute to the shared Classic player as a separate feature. Diagnose iOS download startup early and guard preparation on both platforms.

This covers the WeaselPlex Android Phone and iOS product in `streamyfin`, targeting `weaselfin`. It is an implementation plan; implementation and releases are separate work. Review status: **final plan agreed by Codex and Claude Opus 5.5 on 2026-10-13 after two review rounds**. All seven required review objections are resolved.

## Evidence and baseline

- Independently reviewed all **172 comparison panels**, with full resolution checks of the disputed person, poster and menu states. The pack has 160 paired panels, 10 platform specific panels and 2 unavailable counterparts; these are coverage classifications, not a count of verified defects.
- Original archive: `WeaselPlex-Visual-Parity-2026-10-10.zip`, 448,554,631 bytes. SHA-256: `6d74e9e78523bf487cb0f07847994142802deedf8e488c2cee73a300df7dd906`. Archive CRC and all **504 PNG hashes** passed. Retrieved from ThinkCentre with owner authorization; review performed on VPS `srv1160496`.
- iPhone baseline: TestFlight **1.0 (94)** source `69a8ae0395e48ded91e8ec06c9a5107d0a91cd15`, rebuilt in Release configuration for iPhone 17 Pro / iOS 26.5 Simulator. This does not establish physical iPhone behavior.
- Android baseline: published stable **1.26 / versionCode 27**, source `dbd0953d92aa9536621408c88c11a8387acda9cc`, on Android 16 emulator.
- Current implementation baseline: freshly fetched `origin/weaselfin` at `c3e994fc55a73ca4d995ccb91396f3a3977f0515`. `app.json` is now Android 1.27 / code 28. Changes since iOS capture source affect Home ordering, Quick Connect settings and camera permission initialization; avoid undoing them.
- Catalogue, scroll offsets, slideshow frames, player frames and device pixel densities are unsynchronized. Compare structure and behavior at matched logical states and widths in points/dp, not raw PNG pixels.

Evidence is retained outside the repository at `/home/justin/.t3/artifacts/weaselplex-parity-plan-2026-10-13/`. Screenshot numbers below resolve through the pack's `coverage.csv`; the attached `report.md` supplies the numbered report findings.

## Reconciliation of the report

| Report finding | Independent assessment | Planned disposition |
| --- | --- | --- |
| 1 — 062 empty Watchlist | Android has the last two declared rails pending. Separately, warm-cache remount can deterministically hide both empty rails and the empty state: query functions do not rerun to restore the reset flags. | Repair cached state and measure request fan-out, work package 1. |
| 2 — 126 item context menu | Confirmed white Android surface. `ItemActionSheetHost` supplies no theme options. iOS is a native dark action menu, not the custom Neon sheet used elsewhere. | Theme the Android actions while preserving action behavior, package 2. |
| 3 — 145 / 147 iOS download | Confirmed outcome difference; startup stage and cause are unknown, and iOS is a simulator rebuild. | High priority physical iPhone investigation; conditional repair, package 7. |
| 4 — 036 / 042 subtitles on mute | Confirmed missing Android row. Current behavior lives in iOS `NativePlayerProvider`; exposing the setting alone would do nothing on Android. | Separate functional parity feature, package 8. |
| 5 — 077 / 079 Requests person hero | Android 079 has backdrop plus portrait; iOS 077–079 lacks the circular portrait. Both run the same layout code. Android 077 also captures a blank backdrop; rotation can create further blank windows while the next image loads. | Restore the iOS portrait; repair image-ready transitions on both platforms, package 5. |
| 6 — 095 library person | Android 096 and 166 show the loaded portrait and filmography. 095 is an incomplete loading state. | Handle loading, missing art and endpoint errors, package 5. |
| 7 — 006 update row and version | Intentional: Android directly distributes APK updates; iOS uses TestFlight. Version formatting reflects build channels. | Preserve platform capabilities and truthful version metadata. |
| 8 — 155 Netflix blur | Android artwork is sharp in **157, 158, 159 and 160**. Persistent decode failure is not established. The existing `ItemImage` already separates blurhash from real image source. | Cold/warm cache and slow/error network checks; bounded loading/failure feedback, package 5. |
| 9 — 053 / 143 refresh overlay | The same partially emerged Android indicator overlaps Home and Watchlist. Capture overscroll or stale refresh state remain possible causes. | Reproduce without capture overscroll before moving it; repair refresh cleanup regardless, package 6. |
| 10 — scrolled headers | Confirmed shared issue across Requests, movie, episode, series and person pages. Native buttons/status icons overlay text and primary actions. | Shared scroll-aware header protection, package 4. |
| 11 — 144 See all grid | The Android header covers the upper poster and its SHOW/count badges. Its visible width matches iOS; 143 shows the full Android poster. See all overlays an opaque-colored transparent header without an Android content inset. | Minimal Android header/inset correction, package 3; broad grid refactor is optional. |
| 12 — back buttons | Mostly native iOS/Android conventions. Current stack guidance intentionally uses native back buttons. | Retain native glyphs; fix contrast, hit areas and any duplicated/custom outliers with package 4. |
| 13 — truncated labels/titles | Settings lose meaningful words on both platforms. A partially visible chip at a horizontal toolbar edge and an ellipsized card title are not equivalent defects. | Wrap important settings labels; preserve horizontal scrolling and deliberate card ellipsis, package 6. |
| 14 — native menus versus sheets | Expected platform presentation. Independent finding: long custom sheets lose their title/close control when scrolled, including 013–016, 115, 117 and 121. | Preserve native iOS menus; keep custom-sheet context and dismissal reachable, package 6. |
| 15 — 060 cast devices | Environment/hardware difference. | Preserve Cast/AirPlay entry points; no simulated devices or forced identical lists. |
| 16 — 104 / 186 dropped frames | Emulator performance observation, not proof of a UI or production decoding defect. | No decoder changes in this plan. |
| Native player tools / OS interfaces | Sleep timer, sync, boost, subtitle search, lock controls, Live Activity, driver selection, permissions, keyboards and OS choosers reflect platform/player capabilities. | Record the feature matrix; broader Native-player feature adoption remains separately scoped. |
| Capture errors | 152 compares different queries; 166 has a movie on the iPhone side. Classic captures 099–103 and 189 retain a keyboard. 105 has a compromised iOS landscape capture noted in `screen-notes.json`. | Correct or exclude these comparisons before acceptance testing, package 0. |

## Additional findings from the review and code

1. **Watchlist counts and refresh can diverge.** The count excludes favorite people although a People rail exists. Rail keys omit server/user scope; See all uses a separate cache prefix that `useFavorite` does not invalidate. Logout currently clears the query cache, so these are robustness and consistency issues, not demonstrated cross-account disclosure. Fix them with the empty-state work.
2. **See all hides content under its header.** Its transparent header inherits an opaque stage color; automatic list inset adjustment does not supply an Android offset. The poster keeps its expected aspect but its top is obscured. Fixed poster sizes inside `89%` wrappers and collections using `index % 3` in landscape are separate code weaknesses; leave them for an evidence-led cleanup.
3. **Person screens need partial failure handling.** The Requests query serially fetches details and credits, and passes neither loading nor error status to the slideshow. Library person returns nothing when item/art is unavailable. `InfiniteHorizontalScroll` renders a loader while data is undefined, including terminal error, with no retry UI.
4. **Requests portrait and backdrop readiness differ.** iOS lacks the portrait rendered on Android; inspect sibling order, transformed-header stacking and image load outcome. Backdrops also bypass configured headers through `Animated.Image`. Rotation fades out before the next keyed image is ready, and missing credit backdrop paths currently enter rotation as an Overseerr not-found logo. These are distinct paths to verify; the pack does not establish proxy headers as the cause.
5. **Long-sheet context is lost on scroll.** `NeonSheet` puts its heading inside `BottomSheetScrollView`. Keep title/close visible without making every sheet permanently full screen.

## Work package 0 — Establish reproducible acceptance fixtures

Before application edits, preserve this pack and capture current source at the same routes. Use the same test account and stable item IDs, record safe build/OS/viewport/route metadata, and distinguish initial loading, success, legitimate empty, failure and refreshed states. Do not mix source versions within a comparison.

Replace 152 and 166 with matching routes/items; dismiss the keyboard before player menus; replace or exclude 105 until a usable iOS landscape capture is obtained. For hero checks, compare scroll-top and collapsed-header states independently, with a fixed slideshow frame. Observe images at initial paint, load completion, rotation and a deliberately failed request. For 062/143/144, wait for relevant query settlement and record time from navigation to capture; global network idle is unsuitable for polling screens. Reproduce 053/143 using navigation or a non-overscrolling scroll-to-top action, and test rapid refreshing true→false transitions. Preserve account state when creating favorites or download fixtures.

Acceptance: each changed state has an iPhone/Android pair or an explicit platform/capability exception. Raw originals, coverage metadata and hashes remain available. Physical-device checks are required for claims about download success, mute detection and hardware UI.

## Work package 1 — Make Watchlist state reliable

**Targets:** `components/home/Favorites.tsx`, `components/home/InfiniteScrollingCollectionList.tsx`, `app/(auth)/(tabs)/(favorites)/index.tsx`, `app/(auth)/(tabs)/(favorites)/see-all.tsx`, `hooks/useFavorite.ts`.

Make query data/status authoritative; remove `emptyState` writes from query functions and the reset effect. The required regression is an empty page reopened within the 60-second cache lifetime: cached empty rails and the global empty state must agree without needing a refetch. Scope keys with server/user identity under a common invalidation prefix and gate requests until identity is ready.

Keep paged type rails and partial-failure behavior. Use the existing aggregate items count plus a Persons total as the first two authoritative checks; when both successfully report zero, show the heart empty state and skip the six item rail requests. Include People in the saved count. For a populated overview, limit initial type fetches to two concurrently within Watchlist orchestration, reuse fresh cached results without consuming a fetch slot, and advance pending categories after either success or error. Preserve populated data during background refresh. A failed count/category must expose retry, not look empty.

Measure Android request start/finish/queue timing under a throttled or slow server. The current eight-request fan-out is established by code; a specific native dispatcher limit has not been verified for this build. A combined items query plus Persons is an alternative only if it preserves per-type visibility, pagination, accurate totals and bounded memory. Do not fetch every favorite unbounded or let the first combined page hide rarer categories. The plan's default is the existing paged rails with count-based empty detection and bounded initial requests.

Invalidate overview and See all after mutation. Refresh calls explicit forced invalidation and releases its spinner in `finally`.

**Acceptance:** empty cold start; empty warm remount within 60 seconds; last favorite removed; people-only favorites; partial failure/retry; identity change; refresh rejection; See all updates after add/remove. A slow Android run distinguishes queued/loading from terminal failure and verifies the request cap without stranded disabled queries. Add focused query/lifecycle regressions. **Gate:** PR-branch iPhone Check TestFlight and owner OK; Android emulator checks from this VPS, with no added Android device approval gate.

## Work package 2 — Brand the Android item action sheet

**Targets:** `components/common/ItemActionSheetHost.tsx`; reuse `components/common/NeonSheet.tsx`, the existing `GlobalModal` host and action rows if library theming cannot express the required appearance.

First verify the installed action-sheet library's Android styling surface. Use a dark NeonBoard background, readable foreground, destructive color and section accent. Prefer a small theme change if sufficient; use the existing mobile sheet primitives if not. Keep iOS native presentation and TV navigation unchanged.

Preserve mark played/unplayed, favorite toggle, episode Next Up dismissal, offline deletion and Cancel. Keep Cancel clear of the Android gesture area using the measured bottom safe inset, and retain item context where space permits. Preserve the host's account identity guard, request ownership and protection from opening twice. Clear requests on every dismissal route, including hardware Back, outside tap, swipe and Cancel; prevent an old close callback from dismissing a newer request. Represent mutation progress/failure without duplicate execution.

**Acceptance:** repeat 126 in Android dark appearance; every action works once; dismissal performs no mutation; logout/account switch and fast repeated long presses cannot execute stale actions. Cover those behavior regressions; use visual checks for styling. **Gate:** PR-branch iPhone Check TestFlight and owner OK for native-menu regression, plus Android emulator action/dismissal checks on this VPS.

## Work package 3 — Restore content below the See all header

**Targets:** `app/(auth)/(tabs)/(favorites)/see-all.tsx` and inherited stack options. Audit the three shared music detail routes that also opt into transparent headers, using fixtures or geometry inspection because this account has no music library.

First confirm measured list/frame bounds against the header in 144. For Android See all, explicitly use a normal opaque stage header (`headerTransparent: false`) so navigation owns the content inset. Preserve iOS header/layout behavior. If this navigation configuration still overlays Android content, use its measured header height once rather than a device-specific padding constant. Avoid adding both native and manual top insets.

**Acceptance:** Android 144 at scroll top shows the complete Breaking Bad poster, SHOW/count badges and title; the iPhone remains unchanged. Check loading, empty and populated lists, portrait/landscape, safe areas and font scaling. **Gate:** PR-branch iPhone Check TestFlight and owner OK, plus VPS Android emulator geometry/screenshots.

**Optional cleanup:** only if separate reproduction shows bad sizing, remove conflicting fixed/percentage widths and derive collection alignment from the actual column count. That cleanup gets its own evidence and regression scope; it does not justify broad collection or TV edits for 144.

## Work package 4 — Protect scrolled headers and status areas

**Targets:** `components/ParallaxPage.tsx`, `components/stacks/NestedTabPageStack.tsx`, Requests slideshow/detail routes, person/movie/series/episode routes, affected stack screen options.

Keep the hero edge-to-edge at scroll top. As content reaches the navigation area, fade in a stage-colored header/status scrim that covers both safe-area top and the native header height. Use the existing UI-thread scroll value and measured insets/header height; avoid device-specific offsets or per-frame React state updates. Ensure the protection sits above content and below native controls and does not intercept touches.

Use the existing native back controls with clear contrast and platform minimum hit targets. Remove any actual duplicate/custom outlier discovered in the audit rather than globally recreating iOS circles on Android. Do not indiscriminately make all headers opaque or add top padding twice.

**Acceptance:** repeat 075/076/078/079/094/135/136/140/163–165 at top, transition and deep scroll; clock/back/actions stay legible and content is not trapped beneath tappable controls. Name the 140 sticky PLAY-row state explicitly: primary actions must not sit behind the status icons. Include Android gesture/button navigation, cutouts and rotation. **Gate:** PR-branch iPhone Check TestFlight and owner OK, plus VPS Android emulator checks at each scroll state.

## Work package 5 — Improve person and poster image readiness

**Targets:** Requests person route, `components/jellyseerr/ParallaxSlideShow.tsx`, library person route, `components/common/InfiniteHorizontalScroll.tsx`, `ItemImage.tsx`, `ServerImage.tsx`; provider grid only if reproduction identifies a defect there.

Make the shared portrait-plus-backdrop composition render on both platforms. iOS 077–079 lacks the portrait: diagnose loaded-image status versus sibling stacking under the transformed backdrop, then minimally correct rendering order/structure. Confirm on a physical iPhone. Separate person details and credits into independently observable requests so one failure does not blank everything. Provide shaped loading placeholders, a deliberate missing-art fallback, and error/retry states for filmography. Stop treating undefined data after error as endless loading. Do not hide the entire person page because its image URL is unavailable.

Use an animated wrapper around the existing server-image path, or pass the correctly resolved headers into animated backdrop sources. Verify headers are scoped to the configured server and never forwarded to unrelated hosts. Preserve animation, recycling identity and correctly separated blurhash placeholders. Filter missing `backdropPath` values before calling `imageProxy`; otherwise it returns the Overseerr not-found logo. Keep the currently visible image until the next backdrop has loaded, then crossfade; a failed next image must retain the current art or use a deliberate fallback, never rotate through black. Verify several full rotation cycles.

For 155, verify cold/warm cache and rapid recycled cells, slow requests and failures. The pack already shows eventual success; retain the current blurhash fix. Add targeted image load/error state or repair source/cache identity only when reproduction identifies the failing path. Diagnostic evidence must omit URLs with tokens, custom header values and account data.

**Acceptance:** person at top loads the same composition on both platforms; missing/failed artwork is readable; details remain usable if credits fail; failed posters show a deliberate fallback; loaded posters are sharp. Check 077 versus loaded 079, 095 versus 096, and 155 versus 157–160. No repeated fetch loop or per-card global subscription. Audit the Appeared in rail against the existing shared gap; change spacing only if measured overlap/zero-gap remains after loading. **Gate:** PR-branch iPhone Check TestFlight and owner OK, including the missing portrait, plus VPS Android emulator loading/error/rotation checks.

## Work package 6 — Make settings, long sheets and refresh readable

**Targets:** `components/list/ListItem.tsx`, `PlatformDropdown.tsx`, `NeonSheet.tsx`, playback/appearance settings, `components/home/Home.tsx`, affected refresh handlers.

Let important settings labels wrap and rows grow while controls keep usable widths. Where a wide selector competes with text, stack the control on compact widths instead of shrinking typography. Preserve full accessibility labels and existing diagnostic-value wrapping. Use existing translations; new copy goes only into the English source catalogue.

Keep title/close reachable on long custom sheets using a fixed heading and scrollable body, or a verified sticky header compatible with Gorhom dynamic sizing. Keep short sheets content-sized and keyboard handling intact. Native iOS popovers remain native. Confirm that horizontal filter chips can scroll to show their complete text; do not expand every chip/card title into multi-line content.

Reproduce 053 and 143 without capture overscroll before changing indicator position. If overlap persists, use measured root-header/insets or the existing LoadingLine while retaining the gesture. Independently audit every mobile `RefreshControl` host, including Home, Favorites, collections and both watchlist routes, and release loading in `finally`. Test rejected promises, rapid start/finish, and explicit refresh while reachability reports offline.

**Acceptance:** full meaning of 022/025/046 labels at default and 1.3 font scale; controls remain tappable; long languages/years/tags retain a visible close path; 053 refresh does not obscure its title; all menus/rows remain usable on small phones and with the keyboard; 143 does not retain a stale indicator. **Gate:** PR-branch iPhone Check TestFlight and owner OK, plus VPS Android emulator font/sheet/refresh checks.

## Work package 7 — Diagnose and repair iOS download startup

**Targets:** `components/DownloadItem.tsx`, `providers/Downloads/hooks/useDownloadOperations.ts`, `additionalDownloads.ts`, pending records, event handlers/reconciliation, and `modules/background-downloader/ios` only when evidence points there.

Reproduce Low and Max on a physical iPhone using the exact same small eligible media/account policy as Android. Trace permission/policy, resolved media source, download URL, additional asset preparation, JS process insertion, persisted pending record, native enqueue, start/progress events and reconciliation. Record safe stage/error codes rather than credential-bearing URLs. Test direct download and required transcode separately.

The current process is inserted only **after** additional assets finish. A preparatory hang can therefore leave Downloads looking empty. Expose a truthful preparing/queued state promptly, make preparation errors visible, and give cancellation/retry a finite outcome. Avoid inventing a running transfer before native enqueue succeeds. Handle the promise rejection from the delayed `initiateDownload` call and failed native handoff; do not leave a success toast or stale pending record after failure.

Reserve a synchronous per-item preparation guard before awaiting any asset work; key it to the session/item and an operation generation so double-tap or Low→Max cannot enqueue twice to the same destination. Release ownership in `finally`, and block late results after cancel, timeout or account change from creating a pending record or enqueuing. Clone the media source and its stream entries before replacing subtitle delivery URLs, so query-cached metadata stays untouched.

Use cancellable preparation where the installed file API supports it and an explicit timeout budget per asset class otherwise. Optional artwork/trickplay and optional subtitle downloads may degrade without blocking the video transfer; preserve required selected-subtitle semantics, reporting an unavailable selected track rather than falsely claiming it was downloaded. A timeout race alone does not stop native I/O: use generation guards, stage files under the operation's own temporary names and clean up owned late results. Verify filesystem/session permission failures separately from optional network failures. The implementation PR must state the chosen finite budgets and test them with controlled stalls.

Choose native changes only after locating the failing stage. If physical iPhone succeeds and the issue is simulator-specific, retain the evidence and implement only independently established feedback/error gaps. Escalate this ahead of polish if a physical device cannot download.

**Acceptance:** preparing → queued/active → completed → offline playback; **Low and Max on both platforms** (the pack establishes Android Max/direct only); duplicate tap and Low→Max during preparation create one transfer; cancel/timeout/late completion; failure/retry; background/relaunch; original cached subtitle URLs remain unchanged. No orphan record, owned files or silent empty screen. Cleanup removes only test downloads. **Gate:** PR-branch iPhone Check TestFlight and owner OK; physical Android download checks, with an available test phone as the preferred target. Agent physical Android access is a validation preference, not an AGENTS.md merge gate: if unavailable, record the gap and rely on VPS emulator/function tests before merge plus owner phone verification before publication. Swift changes require M4 native validation; Kotlin changes require a green compile gate.

## Work package 8 — Add subtitles on mute to Classic playback

**Targets:** `components/settings/SubtitleToggles.tsx`, `utils/atoms/settings.ts`, Classic `VideoContext.tsx` / direct-player session, volume listener hooks, subtitle selection utilities. Use `NativePlayerProvider` as behavior reference.

This changes the shared **iOS Classic and Android Classic** player; the existing iOS Native implementation stays intact. Implement both Classic paths before exposing the Android toggle. **Owner-approved default, confirmed 2026-10-13:** keep `subtitlesOnMute: true` to match iPhone. Existing Android installs gain automatic behavior on upgrade; mention the newly active Android behavior in release notes and the package 8 PR. Preserve explicit saved Off preferences; no opt-in migration is required.

Subscribe to media volume once at the active playback-session level, outside controls that mount/unmount as chrome visibility changes, including hardware buttons, and clean up on close/replacement. Derive mute transitions from that one volume source. Have the in-player mute toggle set media volume and feed the listener rather than independently firing automation; retain previous-volume restoration as separate UI state. Initially seed volume without treating an already-muted player as a new mute transition, matching current Native behavior. Reuse normal subtitle selection and language preference; automatically select only eligible non-forced text tracks when subtitles are off. Skip selection that would restart a transcode or override an existing/local/manual selection.

Record ownership of the auto-selected track. Restore Off on unmute only while that selection is still owned by the automation; explicit user choices, including reselecting the same track, must revoke ownership. Reset ownership across sessions/items and disabling the setting. Respect setting/plugin locks. Keep iOS Native working; the settings row becomes truthful for both iOS player choices and Android Classic after validation.

**Acceptance:** hardware and gesture mute/unmute; no track; preferred/default track; existing subtitles; manual override; transcode; disable while muted; next item; close/reopen; listener removal. Focused state-machine/session tests, controls hidden/shown, and physical iPhone Classic/Native and Android playback validation. **Gate:** PR-branch iPhone Check TestFlight and owner OK. Physical Android is the preferred validation lane; absent agent access is recorded and covered by VPS emulator/session tests plus owner phone verification before publication, without adding an Android device approval gate before merge. Native Kotlin additions, if needed, require the Android compile gate. Broader sleep timer/sync/boost/search/lock parity remains a separate feature proposal.

## Delivery sequence and validation

1. Package 0 precedes acceptance decisions. Implement package 1, then 2 and the minimal package 3 header correction as small reviewable PRs. Package 4 follows measured header/scroll reproduction. Package 5 can then reuse the tested header foundation.
2. Package 7's physical-device investigation runs early; a reproduced download failure moves its repair ahead of cosmetic work. Package 6 follows the shared layout fixes. Package 8 is a separate shared Classic behavior PR after the core fixes.
3. For each implementation PR: use Bun, run repository TypeScript checking and changed-file Biome, focused behavior tests where state logic changes, and production Hermes export for each affected phone platform. Pure visual changes use native visual verification rather than tests that merely restate styles. Run the broader unit suite when shared query/player/download logic changes.
4. Any Kotlin/JNI changes under `modules/*/android` must have a green hosted **WeaselPlex Android compile check** or equivalent local `bun run android:compile-check` with its `COMPILE OK` quoted in the PR. Before claiming a local compile, verify executable `ndk-build`. Branch protection making this check required remains open admin work; it does not block this plan.
5. Build iOS only on M4. Every implementation package 1–8 edits shared phone code and requires branch → commit → PR → **Check TestFlight from the PR branch** → owner on-device OK → merge to `weaselfin`; even Android-only presentation branches get an iOS regression check. Package 0 supplies evidence rather than application edits. An earlier release's approval waiver does not waive this work. Tag/official Release TestFlight only when requested or needed for a tagged release.
6. Android follows merge → tag → signed APK on the thread's authorized Android worker → **weaselplex-phone / stable only**, when the owner requests publication. A publish changes only release assets/pointers/ledger/alias, preserves current channels and canonical Neon pages, and uses the prescribed publish script. This plan authorizes no publication.
7. Use VPS Android emulator verification for each package before merge; the Android physical lane for packages 7/8 is preferred and documented, with owner phone verification before publication when agent access is unavailable. A failing functional test/compile or missing iPhone approval blocks merge; Android device availability alone does not. Keep VPS editing/testing/transfers here except explicitly authorized source retrieval; M4 retains its iOS-only role. After pushed implementation work, run `scripts/sync-machines.sh` and report unreachable/skipped checkouts. Apply required Android/M4 disk cleanup. Update the existing Android Phone/iOS Product rows and the Ops log at completion.

## Completion criteria

Confirmed defects have measured before/after evidence, state regressions pass, errors/empty/loading states remain distinct, and owner iPhone approval precedes merge. Conditional observations close with either a reproduced fix or evidence that they are capture/environment states plus adequate fallback behavior. Platform exceptions and broader player-feature decisions remain explicitly recorded. No PR is considered complete just because screenshots look similar while an action, favorite count or download state is wrong.


## Review agreement and implementation notes

Claude Opus 5.5 agreed to the revised plan in round 2 and requested no further round. The agreed choices include the minimal Android See all header correction, restoring the iOS person portrait, retaining paged Watchlist rails with a zero-count shortcut, keeping the existing On mute default, subsequently confirmed by the owner, and following the existing device/compile gates. The review records and Codex responses are retained with the evidence archive.

During implementation, time a populated Watchlist on iPhone as well as Android; the two-request cap must not create a visible loading regression. Include conditional music refresh screens in the `finally` audit. Prefer inactivity-based asset preparation budgets where progress is observable, and verify slow progressing work rather than treating it as stalled. Confirm that the corrected Android See all header matches neighboring stage colors.
