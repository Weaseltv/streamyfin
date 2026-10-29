# WeaselPlex Phases 3 and 4: third review / verification (Opus 5.5)

Date: 2026-10-29. Read-only on srv1160496. I made no source edits, builds, tests, network, server or device calls, used no other machine and delegated nothing. Everything below comes from reading code, diffs and docs. **I ran none of the tests and executed nothing.** The test, typecheck and Biome results in the brief are the parent's claims; I have not reproduced them.

What I read:
- Phone: `request-status-phase3`. Commits `728d9d99` and `49aecd6e`, plus the uncommitted diff in 10 files.
- Backend: `request-push-phase4`. The uncommitted and untracked diff against `141f628`.
- TV: the fixture at `b8a47d9c`, `RequestStage.kt` `eventKey()`, and AGENTS.md.
- Round 2 findings: `/tmp/weaselplex-p34-review-implementation.md`.

## Verdict: **AGREE**

No P1 or P2 remains. Every round 2 fix is present in the code as described. My spot-check found no new P1 or P2. The P3 notes at the end are optional and do not block.

---

## Round 2 findings: verification

| ID | Status | Evidence |
|---|---|---|
| R-P1-1 relay hang during a Valkey outage | **Fixed** | See below. |
| R-P2-1 manual-server auth regression | **Fixed** | See below. |
| R-P2-2 `usePathname` in the provider | **Fixed** | See below. |
| R-P2-3 RecentRequestsSlide regression | **Fixed** | See below. |
| R-P2-4 receipt transaction held across the network call | **Fixed** | See below. |
| R-P2-5 fixture and vacuous transition case | **Fixed (TV executable test deferred, acceptable)** | See below. |

**R-P1-1 relay hang (fixed)**
- `outbox-relay.ts:447-461` is a producer-only Queue: `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, `connectTimeout: 5000`. It has an `error` listener, so an unhandled EventEmitter error cannot crash the worker.
- `request-push-enqueue.ts` races `add` against a 5 s deadline. The timer is cleared in `finally`. The job ID is the deterministic `outbox-${id}`.
- Because `Promise.race` attaches handlers, a late rejection of `add` is not an unhandled rejection.
- A rejection or timeout marks the event `failed`, `request_push_queue_unavailable`, 5-minute backoff, then `continue`. The other rows in the batch still commit.
- This matters because BullMQ's `waitUntilReady` (`node_modules/bullmq/.../redis-connection.js:103-158`) never rejects on `error`. A client that was never ready would otherwise wait forever. The deadline is the effective guard.
- The `close()` path adds `requestPushQueue.close()`.

**R-P2-1 manual-server auth regression (fixed)**
- `isPinnedRequestServer` (`utils/requestStatus.ts:224`) normalizes a trailing slash and case.
- The hard check `requestAccountMatches` in `useJellyseerr` `isCurrent` applies only on the pinned server. On manual servers the old identity checks are kept.
- The mismatch effect returns early for non-pinned servers, so there is no clear or reconnect there.
- The probe and auto-connect use the helper.
- The status `session` memo still requires `requestAccountMatches` for every server, so status fails closed.
- `49aecd6e` checks the expected media UUID before `storage.setAny(JELLYSEERR_USER)`. A mismatched Quick Connect profile throws without being stored, so there is no clear/reconnect loop.

**R-P2-2 `usePathname` in the provider (fixed)**
- `usePathname` is removed from the provider.
- `requestBrowsingAtom` is set by `useFocusEffect` in `(tabs)/_layout.tsx`: true on focus, false on blur or unmount. That layout already used `useSegments`, so no new navigation-state subscriber is added.
- `(auth)/player`, `(auth)/now-playing` (modal) and `login` are sibling root-stack screens (`app/_layout.tsx:578-611`). Opening them blurs `(auth)/(tabs)`.
- With `freezeOnBlur`, the blur listener still runs, and the atom lives in the global store.
- The native-player, sheet-count, global-modal and keyboard gates remain.
- "Banner never switches tabs" is recorded as an owner device check in `phase3.md:62-63`.

**R-P2-3 RecentRequestsSlide regression (fixed)**
- The `requests()` list query is restored, keyed by base URL and Seerr user.
- `showDownloadInfo` is kept. The details key is account-scoped.
- Only the 5-second `getRequest` poll is removed. The card uses the list row, which is the same `MediaRequest` shape, so `profileName` and `canRemove` come from the server again.

**R-P2-4 receipt transaction (fixed)**
- `weaselplex-request-push.ts:248-276`:
  - The expiry is a separate statement.
  - The select takes no lock and opens no transaction.
  - `getReceipts` runs with no transaction open.
- The single short `tx()` (2 s `lock_timeout`, 5 s `statement_timeout`) guards each update with `id, ticket_id, state='ticketed', next_receipt_at<=cutoff`.
- The device disable runs only when `rowCount` is set, and it keeps the `binding_id` guard.
- `concurrency: 1` and the job scheduler prevent overlapping sweeps.

**R-P2-5 fixture (fixed; TV executable test deferred, acceptable)**
- The TV fixture is committed at `b8a47d9c`, and the TV worktree is clean.
- `cmp` shows the phone copy is byte-identical.
- Both `transitionCases` now have `expectedPending`. The phone test asserts it unconditionally (`requestStatus.test.ts:123`), so a missing expectation now fails instead of passing vacuously.
- Deferring the TV JVM fixture test is acceptable under the TV AGENTS fast-Alpha rule. Round 2 also allowed it as a follow-up.

### Round 2 P3 items

| P3 item | Status |
|---|---|
| P3-1 refetch while the first fetch is in flight | Addressed: `!query.isFetching` |
| P3-3 rows stuck in `pending` | Addressed: sweep at `:236-238` |
| P3-4 lost push after the claim | Addressed: comment at `:169-170` |
| P3-5 device cap counted disabled rows | Addressed: `and enabled` at web lib `:186` |
| P3-6 disposition/ignored consistency | Addressed: CHECK in both the SQL (`0042:27`) and Drizzle (`request-push.ts:59-62`) |
| P3-6 schema test depth | Partly addressed: the test still compares names, not full definitions (accepted; manual review) |
| P3-7 invalid UTF-8 in the webhook body | Addressed: `TextDecoder(fatal:true)` returns 400 |
| P3-9 normalized URL at the probe | Addressed |

The migration expected tail now includes `0042`, in both the replay test and the p2 journal test.

## New spot-check (queue deadline, account isolation, banner lifecycle, receipt guards, schema): no P1 or P2

## P3: optional, non-blocking

1. **Relay worst case during an outage.** A pre-ready client times out per event. A batch of 25 push events can therefore keep the relay transaction open, and the other topics waiting, for up to about 125 s per poll. This is bounded, not a hang.
   - Option: after the first push enqueue failure in a poll, mark the remaining push rows in that batch `failed` without calling `add`.
   - The `error` listener also logs on every ioredis reconnect attempt. Consider rate-limiting it.
2. **Companion login.** `(tabs)/(home)/companion-login.tsx` is inside the tabs. The old path regex excluded it as "login"; the focus atom does not, so the banner can appear on the TV-pairing code screen. The keyboard gate covers active typing. Optional: set the browsing atom false from that screen's `useFocusEffect`.
3. **`http://` variant of the pinned server.** `requestScope` treats `http://requests.theweasel.tv` as pinned, but `isPinnedRequestServer` matches `https` only. The result fails closed (manual-server behavior; status still requires an account match). Align the two only if the `http` form can actually be stored.
4. **Phase 5 recipient guard is not in the docs.** Round 2 P3-8 asked for the cold-start and warm-listener `kind:"request"` + recipient UUID + live-session check to be written down for Phase 5. Neither phase doc states it.
   - `phase4.md:76-77` says the `url` is "compatible with the existing cold-start observer", which could be read as "no guard needed".
   - Add one sentence to both docs: Phase 5 must check kind, recipient and session before routing or presenting, and must DELETE the registration on logout or account switch.
   - This is not blocking: no device can register until Phase 5, and the worker flag is off.
5. **Banner batch dedupe.** It now keeps one key per request ID (`key.split("|")[1]`), which matches TV `eventKey()` `v1|${request.id}|…`. It is fine as written. A comment noting that index 1 is the request ID, not the TMDB ID, would help.
6. **Stale-pending sweep reference time.** The sweep uses the delivery row's `created_at`. `deliverRequestPush` uses the event's `created_at`. A delivery is never older than its event, so the effect is at most a slightly later skip.

## Gates (unchanged)

- **Phone:** draft PR to `weaselfin`. Pending: Check TestFlight, and the owner's device check, including "banner never switches tabs". No M4, merge, tag or release.
- **Backend:** both flags default off. Deployment is owner-gated, in the `phase4.md` order: web on with worker off; real-event proof; Phase 5 complete; then worker on.
- **TV:** the `RequestStageFixtureTest` JVM test remains a recorded follow-up.
- No real requests, webhooks, Expo pushes, customer deploys or releases.
