# Phone My requests — phase 3

Implemented on srv1160496 from origin/weaselfin 9aa4def9. Shared TypeScript serves
both iOS and Android phone apps; no native code or push registration is changed.
The owner is away, so Check TestFlight and the owner's on-device approval remain
pending before any iOS merge. No M4 use, merge, tag, release or store upload.

Requests now has Discover / My requests. The status list groups Ready,
In progress and Needs attention, shows title/poster/year, selected quality,
requested date, honest stage/progress/future ETA, update age and Refresh. A
successful own request seeds its returned ID and opens My requests with that
card scrolled into view and highlighted. Watch now uses the exact request
quality's library ID, otherwise Details remains available. Cancel is restricted
to the exact owned pending request, with confirmation and immediate local removal.
Old terminal cards are hidden after 30 days independently of synchronization.

One root provider owns foreground polling, single-flight reads, query state and
presentation. It reads every owned page (1,000-row safety cap), filters owners,
hydrates TV media seasons at most four at once, dedupes per media, reuses unchanged
fresh ready/failed snapshots and retains last-known stages when hydration fails.
A first unknown season snapshot is Checking and cannot notify. Missing persisted
rows get an owned detail read; two 404s on separate syncs confirm removal.

Poll every minute while My requests is visible or a download/import is active,
five minutes for other nonterminal work, 30 minutes idle; failures back off
1/2/5/10 minutes. Background cancels reads; resume and opening stale My requests
refresh. The old Recent requests five-second per-card poll is gone. Metadata is
lazy, cached per account and isolated from sync failures.

The request user's normalized Jellyfin UUID must match the current signed-in
profile before polling or presenting. Mismatches clear the old request session
once and reuse existing silent Quick Connect. Captured client/account checks
reject late reads, cookies and auth errors. A list 401/403 permits one separate,
persisted 15-minute /auth/me probe (including after a phone cold start). Permission
403 with a live identity retains the session; a dead pinned-server session gets
one silent reconnect. No detail/action probe, password retry or separate Seerr
sign-in is introduced. Custom request servers are not silently re-provisioned.

The MMKV journal persists initial baseline, locally seeded exceptions, pending
updates and already-presented event keys. Polling and the future phase 5 push
handler share `claimRequestPresentation` synchronously in either arrival order.
Existing ready rows are baselined once, new own submissions are exempt. A newer
stage supersedes older pending updates for that request. Turning notifications
off drains/suppresses pending updates instead of accumulating a later flood.
The switch is in My requests and is per request account. The journal retains up
to 5,000 known request IDs and 10,000 presentation keys; active sync caps at 1,000.

The in-app banner waits for foreground browsing with no playback, open request
sheet/global dialog or keyboard. It offers View requests / Dismiss, batches
updates, and hides for unsafe moments. Its batch is account-scoped. Native
notification permissions, registration, push foreground handling and tap routing
remain phase 5; the existing Streamyfin registration is untouched.

`request-stages.md` and `request-stages.fixture.json` are copied from the final TV
contract including Phase 0 corrections: no failed-search inference from an empty
queue, requested TV season readiness, no quality substitution, finite byte-only
progress, genuine future release dates and no failure push on later library
removal. Portable identity is `v1|id|hd-or-4k|ready-or-partial-or-failed|signature`.
The executable parity, transitions and presentation tests consume that fixture.

Validation runs on the assigned VPS only. TypeScript, unit tests and scoped
format checks are recorded with the PR. Phone device/UI feel remains the owner's
check. Review ledgers are retained alongside this file. No real request,
authentication probe, customer webhook or push was sent during implementation.
