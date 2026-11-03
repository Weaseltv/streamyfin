# WeaselPlex Phases 3 and 4: second implementation review (Opus 5.5)

Date: 2026-10-29. Read-only on srv1160496. I made no source edits, builds, tests, network, server or device calls, used no other machine and delegated nothing. Every finding below comes from reading the code. **None of it was checked by running anything.**

What I read:
- Phone: `request-status-phase3`, current diff against `origin/weaselfin`, including untracked files.
- Backend: `request-push-phase4`, current diff against `origin/main`, including untracked files.
- Plan: `plan-final.md` §6.1 and §7.
- Phase 0 findings.
- TV: `docs/request-stages.md`, the fixture (uncommitted change in this worktree) and `RequestStage.kt`.
- The prior round's findings: `/tmp/weaselplex-p34-review-scope.md`.

Verdict: **not AGREE yet.** One prior P1 is not actually fixed (R-P1-1). There are five new P2s. Everything else from the prior round is resolved; see the tally at the end.

---

## P1: fix before review

### R-P1-1 (backend relay): the P1-4 fix cannot trigger, because `queue.add` hangs instead of throwing while Valkey is down

**Where:** `apps/worker/src/outbox-relay.ts:446-449` and `:501-515`.

**Problem:**
- The request-push `Queue` uses `maxRetriesPerRequest: null` with ioredis's default offline queue (`enableOfflineQueue: true`).
- In that mode, a command issued while Valkey is unreachable is queued until the connection comes back. It is never rejected. BullMQ's `add` also waits on `waitUntilReady()`.
- So during an outage, `await requestPushQueue.add(...)` never settles, and the new `catch` (state `failed`, retry in 5 minutes) is never reached.

**What happens during an outage:**
- The relay's batch transaction stays open (`idle in transaction`) and keeps up to 25 `outbox_events` rows locked.
- `running` never resolves, so every later `poll()` returns early. All lifecycle email and diagnostics relaying stops for the whole outage.
- If the worker is restarted during the outage, the transaction rolls back. Emails already sent earlier in that batch are sent again. This is exactly the duplicate that P1-4 was meant to prevent.
- `close()` also blocks on `await running`.
- The diagnostics branch has the same existing pattern, but the push branch is new code that claims this protection.

**Fix:**
1. Give the relay's push `Queue` a producer-only connection: `{ url, enableReadyCheck: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 }`. BullMQ's guidance is to fail fast on producers; only `Worker` needs `null`.
2. Bound the call:
   ```ts
   await Promise.race([
     add,
     new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 5000).unref()),
   ])
   ```
   Treat a timeout like any other error: `request_push_queue_unavailable`, five-minute backoff, `continue`.
   A late `add` that lands after the timeout is harmless. The job ID is the deterministic `outbox-${event.id}`, and the `weaselplex_push_deliveries` unique key and `state='pending'` claim stop a second send.
3. Recommended, optionally in this PR: apply the same `enableOfflineQueue: false` and timeout to `diagnosticsQueue.add`, which has the same hazard.

**Test:** inject a stub queue whose `add` never resolves. Assert that the poll finishes within the timeout, marks the event `failed` with `request_push_queue_unavailable`, and still commits the other rows in the batch.

---

## P2: fix in this PR

### R-P2-1 (phone): the hard account-match gate in `JellyseerrApi.isCurrent` disables the whole Requests feature for manual-server users whose Seerr Jellyfin ID differs

**Where:** `hooks/useJellyseerr.ts:~572-576` adds `requestAccountMatches(jellyseerrUser.jellyfinUserId, mediaUser?.Id)` to `isCurrent`. The request interceptor (`:~526`) then throws `CanceledError` on every call. Separately, `RequestStatusProvider.tsx:121-135` calls `clearJellyseerrStorageData()` on any mismatch, whatever the server.

**Problem:**
- On a manually configured Seerr whose Jellyfin user ID is not the signed-in Jellyfin user's ID, every Seerr call is cancelled: discover, search, details and request. Examples: a Seerr backed by a different Jellyfin server, or `jellyfinUserId` being null.
- The stored login is also cleared once per mount.
- There is no silent reconnect for manual servers, so the user cannot use Requests at all. This goes beyond request status and was not requested. The prior P1-1 asked only to gate the status session, plus a clear and reconnect for the pinned server.

**Fix:**
- Keep the match requirement in the `session` memo. Request status stays off on any mismatch, which is the account-leakage protection.
- In `useJellyseerr`'s `isCurrent`, apply the `requestAccountMatches` term only when `normalizeUrl(settings.jellyseerrServerUrl) === WEASEL_SEERR_URL`. Otherwise keep the old identity checks: the same atom object and the same media user.
- In the mismatch effect, call `clearJellyseerrStorageData()` and `requestWeaselSeerrReconnect()` only for the pinned server. For a manual server, do nothing beyond the disabled status session. My requests already shows "not connected".
- Compare URLs normalized (trailing slash, case), the same way `requestScope` does, here and in the probe at `:228`.

**Test:** with a manual URL and mismatched IDs, `isCurrent()` returns true and `clearJellyseerrStorageData` is not called; with the pinned URL and mismatched IDs, it returns false and is called once.

### R-P2-2 (phone): `usePathname()` at provider level is the same hazard as the learned `native-bottom-tabs-userouter-conflict` fact

**Where:** `providers/RequestStatusProvider.tsx:3` and `:368`. `RequestUpdateBanner` is mounted from the root provider, outside the tab navigator.

**Problem:** the learned fact says that hooks subscribing to navigation state from provider level can cause unexpected native tab switches. `usePathname` subscribes to the same route state that `useRouter` does. The brief says the static `router` import is used to avoid native tab hooks. That is true for navigation, but this hook still runs at provider level. This is PLAUSIBLE, not proven; it needs the owner's device check.

**Fix (either):**
- (a) Remove `usePathname` from the provider. Publish an "unsafe route" flag through a jotai atom that is set by the player, now-playing and login screens (`useFocusEffect` → `store.set(requestUnsafeRouteAtom, n±1)`), as was done for `requestSheetCountAtom`.
- (b) Mount `RequestUpdateBanner` inside `app/(auth)/(tabs)/_layout.tsx`, below the navigator, and read the pathname there. The banner state already lives in the provider context.

Option (a) is preferred: it is local and matches the sheet-count pattern. Record "banner never switches tabs" as an owner device check in the PR.

### R-P2-3 (phone): `RecentRequestsSlide` now shows only the user's own provider rows

**Where:** `components/jellyseerr/discover/RecentRequestsSlide.tsx`.

**Problems (changes the plan did not ask for):** the plan (§6.1, line 112) only says to turn off the 5-second per-card poll. The diff also:
- replaces the slide's `requests()` list (server-wide recent requests for users with REQUEST_VIEW, which includes the owner and admins) with own rows only;
- makes the slide empty whenever the status session is off: TV, a manual-server mismatch, or before the first sync;
- drops `showDownloadInfo` from the cards;
- hard-codes `profileName: "Unknown"`.

The owner's standing preference is no UI behavior they did not ask for.

**Fix:**
- Restore the original `useQuery(["jellyseerr","recent_requests"], () => jellyseerrApi.requests())`. It is a single fetch with `staleTime: 0` and no interval, and it also restores `profileName` and `canRemove` from the row.
- In `RequestCard`, drop only the 5-second `refetchInterval` query. Use `state.rows.find(id)?.request ?? request` as the enriched `mediaRequest`.
- Keep `showDownloadInfo`. Progress now updates at the provider's cadence.
- Keep `scope` in the details key.

### R-P2-4 (receipt path, backend): a DB transaction and row locks are held across the Expo `getReceipts` call

**Where:** `apps/worker/src/weaselplex-request-push.ts:245-300`.

**Problem:**
- `select … for update skip locked` on up to 100 ticketed deliveries, then a POST to Expo (up to 10 s; `statement_timeout` does not cover idle-in-transaction time), then the updates.
- Any registry write that deletes a device row cascades to `weaselplex_push_deliveries` and waits on those locks:
  - token rotation, `:196`;
  - account rebind with a deleted install;
  - `DELETE /push-devices`, `:173`.
- Registration runs with `lock_timeout='1s'`, so it gets a **503**. The DELETE route has no lock timeout and stalls for up to 10 s.
- This is the same lock-across-network issue P1-2 fixed for sends, and the brief's rule is "no DB transaction open across network".

**Fix:**
1. Select due rows without a transaction or lock. The worker has `concurrency: 1` and the job scheduler runs one at a time.
2. Call `getReceipts` with no transaction open.
3. Apply the results in one short `tx()`. Each update must be guarded with `where id=$1 and state='ticketed'` so a concurrent cascade or state change is respected. The device disable keeps its `binding_id` guard.
4. Move the expiry update (`receipt_expired`) into its own statement before the select.

### R-P2-5 (shared fixture, TV, process): the TV side does not enforce the fixture, the change is uncommitted, and one transition case asserts nothing

**Where:**
- `/home/justin/.t3/worktrees/Wholphin/t3-abd0cfd3`: `git status` shows `M docs/request-stages.fixture.json`, uncommitted on `t3/in-app-request-status-notifications`. There is no Kotlin test that reads it: `grep -r request-stages.fixture app/src` finds nothing.
- The phone's `utils/requestStatus.test.ts:113-124` checks `expectedPending` only when it is present. `transitionCases[0]` (`failed_retried_ready`) has none, so it passes vacuously.

**Problem:**
- "Updated first in TV then copied" is a documentation copy only. Parity is enforced on the phone, not against `RequestStage.kt`.
- I spot-checked the new cases by hand: the blocklisted, deleted and removed-after-completion notify rules match `RequestStage.kt:49`, and the key format matches `:96`. That is a reading, not a test.
- If the TV worktree is reset or cleaned, the source copy is lost.

**Fix:**
- Commit the fixture on the TV branch with a short docs commit. No build or install is needed.
- Add a JVM unit test on the TV side, `RequestStageFixtureTest`, that reads `docs/request-stages.fixture.json` and asserts `expectedKind` and `expectedKey` through `RequestStage.kt`. It can be a follow-up TV task, but record it in both PRs as a gap.
- Add `"expectedPending": ["v1|11|hd|ready|-"]` to `failed_retried_ready`. Make the phone test fail if a transition case has no expectation, so a vacuous pass cannot recur.

---

## P3: polish, follow-ups and Phase 5 requirements

1. **Phone, refetch on open:** `setVisible` refetches when `dataUpdatedAt` is 0 even while the first fetch is in flight. `refetch()` then cancels it and starts again (`cancelRefetch` defaults to true). Add `&& !query.isFetching`.
2. **Phone, missing-row re-reads:** a known ID whose detail returns another owner (`syncOwnRequests.ts:72-77`), or a non-404 error, is re-read on every sync indefinitely and never forgotten. Count "owner mismatch" toward `missing`, the same as a 404.
3. **Backend, rows stuck in `pending`:** if BullMQ job attempts run out (for example after DB errors) before delivery attempts reach 4, the row stays `pending` forever. In the receipt sweep, set `pending` rows whose event `created_at` is older than 24 hours to `skipped, last_error_class='stale'`. The age check in `deliverRequestPush` only runs when a job runs.
4. **Backend, lost push after the claim:** if the recheck query at `:131` throws after the claim commits, the claimed rows stay `sending`, become `unknown` and are never sent. This is the accepted no-resend tradeoff, but document it next to the comment at `:169` so nobody "fixes" it into a resend.
5. **Backend, device cap:** the cap query (`weaselplex-request-push.ts:186`) counts disabled rows, including DeviceNotRegistered ones, for 60 days. Add `and enabled`.
6. **Schema:**
   - Add `CHECK ((disposition = 'queued') = (NOT ignored))` in both the SQL and Drizzle.
   - `request-push-schema.test.ts` compares only column and check names. "Full matching" should also compare `pg_get_constraintdef` text, plus `data_type`, `is_nullable` and `column_default` per column, against the Drizzle config.
7. **Webhook edge cases (authenticated only, low risk):**
   - A 409 `EVENT_CONFLICT` stores nothing. Consider storing it as `invalid` for diagnosis.
   - `toString("utf8")` on invalid UTF-8 can push `raw_body` past the 32,768-octet CHECK, which turns the request into a 503. Check `Buffer.byteLength(raw)` after decoding, or decode with `fatal: true` and return 400.
8. **Phase 5 router (record in both PRs):**
   - The existing cold-start observer (`app/_layout.tsx:143-151`) calls `router.push(data.url)` for any notification. A request push must not reach that unguarded. Before routing or presenting, Phase 5 must:
     - check `kind === "request"`;
     - check `normalize(data.recipientJellyfinUserId) === normalize(userAtom.Id)` and that the status session is live;
     - map that session's `requestScope` and call `claimRequestPresentation(scope, eventKey)`.
   - The warm listener (`:471-505`) ignores `data.url` when `type` is not movie or episode, so it needs a `kind:"request"` branch.
   - Logout and account switch must `DELETE` the device registration.
9. **Phone, probe URL comparison:** compare normalized URLs at the probe too (see R-P2-1).

---

## Prior findings: current status

| Prior | Status | Note |
|---|---|---|
| P1-1 account binding | **Partly fixed** | The session and `isCurrent` gate are in place. Its scope is too broad: R-P2-1. |
| P1-2 claims and no transaction across the send | **Fixed** | Claim committed before Expo, recheck before send, `state='sending'` guards, 10-minute sweep to `unknown`. The receipt path still holds locks: R-P2-4. |
| P1-3 stale backlog | **Fixed** | 24-hour cutoff in the worker (insert, select and pending skip) and relay dead-letter. Runbook rollout order is present. Rows stuck in `pending`: P3-3. |
| P1-4 Valkey failure in the relay | **Not effective** | R-P1-1. |
| P1-5 ignored and invalid events | **Fixed** | Stored with a disposition and acknowledged with 200. Title sanitized. 400 only for bad JSON or size, 403 for the secret. |
| P1-6 migration list and schema | **Fixed, test shallow** | Replay list and tables updated. Schema test compares names only: P3-6. |
| P2-1 to P2-6 (phone) | **Fixed** | Superseded pending keys, toggle drain and suppression, bounded journal with seed cleared, server-sized paging, terminal snapshot reuse, Checking for unhydrated rows, refetch on open (P3-1 nit). |
| P2-7 URL scheme | **Fixed** | Internal route path; `itemId` omitted per Phase 0. Phase 5 guard: P3-8. |
| P2-8 IP key, P2-9 body before media call and 409 cap | **Fixed** | |
| P2-10 runbook Bearer header | **Fixed** | `phase4.md:33`. |
| P2-11 fixture cases | **Mostly fixed** | Phone consumes the fixture. TV is not enforced and one case is vacuous: R-P2-5. |
| P3 items | **Fixed** | Banner suppressed while a request sheet is open, local release date, image proxy, Details params, submitted-response owner fallback, `jellyfin_username` dropped, identity check, `created_at` index and 90-day raw retention, cached credential with flag and file `superRefine`, Expo `ttl` and `priority`, install row kept across token rotation. |

## Gates (unchanged)

- **Phone PR:** draft to `weaselfin`. Check TestFlight is pending, and so is the owner's device OK, which includes "banner never switches tabs" (R-P2-2) and the navigation checks. No M4, no merge.
- **Backend PR:** to `main` with both flags off. Deployment is owner-gated, with the rollout order in `phase4.md`.
- **Phase 5:** registration, permission, native config and handlers remain deferred.
- No release, tag, deploy or customer notification.
