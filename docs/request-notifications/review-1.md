# WeaselPlex request status: Phases 3 and 4 architecture review (Opus 5.5 high)

Date: 2026-10-29. Read-only review on srv1160496. I made no source edits, builds, tests, network or device calls, and I delegated nothing.

Sources read:
- Plan: `plan-final.md` §6.1 and §7.
- Phase 0 findings, which supersede the plan where they differ.
- TV `docs/request-stages.md`, its fixture, `RequestStage.kt` and `RequestStatusRepository.kt`.
- The parent's in-progress phone worktree (`request-status-phase3`, base 9aa4def9, uncommitted).
- The parent's in-progress backend worktree (`request-push-phase4`, base 141f628, uncommitted), including the worker. I re-read it just before writing this.

Status tags: **OPEN** means it was still present in the code when I last read it. **ADDRESSED** means the current draft already does it.

Severity: **P1** must be fixed before the PR goes to review. **P2** should be fixed in this PR. **P3** is polish or a follow-up.

---

## Already right (keep)

Phone:
- One provider at the root, `providers/RequestStatusProvider.tsx`. It polls only in the foreground and is off on TV.
- The query key's root is `request-status`, which is outside the offline-persistence allowlist (`utils/query/offlinePersistence.ts`). `gcTime: 0`.
- Paging uses `sort: "added"` (matches the TV's request-ID paging) and `requestedBy` is bound to the session's user. Rows are checked locally for `requestedBy.id`.
- Detail hydration runs at most four at a time and dedupes reads by media. On failure it keeps the last-known stage and marks the row `fresh:false`, so stale rows never create events.
- A tracked row that disappears gets a detail read. It is forgotten only after two 404s.
- The TS truth table matches `RequestStage.kt`: notify semantics, pending-with-partial, quality-specific status, queue and library ID. The fixture copy is byte-identical to the TV one.
- The probe uses `validateStatus: () => true`, so the legacy `/auth/` interceptor cannot clear a newer session. Its timestamp is persisted in MMKV per scope, which is required because the phone probes on a cold-start 403.
- The probe never calls `markWeaselSeerrRefused`. A module-level `exchange` single-flight in `useWeaselSeerrAutoConnect.ts` collapses an automatic re-arm and a retry bump into one Quick Connect exchange.
- No password re-login.
- `isCurrent` is threaded through `JellyseerrApi` and its cookie and 403 interceptors.
- The 5 s per-card poll in `RecentRequestsSlide` is removed. `requestMedia` now has a `.catch`.
- Navigation uses the static `expo-router` import (honors the learned fact `native-bottom-tabs-userouter-conflict`).
- My requests is a SectionList with Ready / In progress / Needs attention, a neutral empty state that requires `complete`, scroll-to-highlight with a fallback for a failed scroll, and Watch now only with the matching-quality library ID.

Backend:
- Reuses the existing `validateUserToken` (`packages/provider-adapters/src/media-server.ts:503`). It calls `/Users/Me` with the client's own token, never the admin key, on the configured base URL only, and never logs the token.
- The rate limit is a DB fixed window with an HMAC subject. It counts the IP before auth and the verified UUID after, and has no `auth_user` or audit side effects.
- Token rebind is an atomic upsert under an advisory lock and rotates `binding_id`. Delete is scoped to the owner, the token and the device.
- The webhook compares the secret in constant time, reads it from a `_FILE` via `readProtectedCredentialFile`, caps the body at 32 KiB, and stores the raw body.
- The event key is deduped by `on conflict(event_key) do nothing` and the outbox row is written in the same transaction.
- `Series Now Available` and the empty Test are acknowledged and ignored. The allowlist is exactly the Phase 0 set. Quality comes from the `4K ` prefix. Decimal IDs are parsed strictly and UUIDs normalized. A movie ready event requires `AVAILABLE` at its quality. There is no username fallback.
- The worker has its own flag and an optional Expo token `_FILE`.
- The relay has an explicit `weaselplex.request.push` branch before `notification.requested`, so no portal `notifications` row is written.
- Deliveries are checked against the binding and recipient at send time.
- DeviceNotRegistered disables the device on both the ticket and the receipt path.
- Receipts are first checked 15 minutes after the send and expire after 24 hours.
- A send with an ambiguous outcome is marked `unknown` and never resent.
- Devices unused for 60 days are disabled, and expired rate windows are deleted.
- Push copy strings were added to the copy test.

---

## P1: fix before review

### P1-1 (phone, OPEN): the request session is not bound to the signed-in Jellyfin user

**Where:** `providers/RequestStatusProvider.tsx:50-54`. The scope is `requestScope(url, jellyseerrUser.id)`, and nothing checks `jellyseerrUser.jellyfinUserId` against `userAtom.Id`.

**Problem:** `loginWithPasswordMutation` and `loginWithSavedCredential` (`providers/JellyfinProvider.tsx:~650-690`, used by `settings.tv.tsx` and `TVLogin.tsx`) switch the Jellyfin user without clearing `JELLYSEERR_USER` or the native Seerr cookie. The next account would then:
- read the previous user's requests;
- reconcile them into the previous user's journal;
- see the previous user's banners.

The query key includes `mediaUser.Id`, but the scope and journal do not.

**Fix:** in the `session` memo, require `normalize(jellyseerrUser.jellyfinUserId) === normalize(mediaUser.Id)`, where normalize is lowercase with dashes removed. On a mismatch:
- leave `session` undefined, so nothing is polled, reconciled or presented;
- call `clearJellyseerrStorageData()` once per mismatch, guarded by a ref keyed on the pair, so auto-connect provisions the right account.

Also make `isCurrent` in `hooks/useJellyseerr.ts` compare the same normalized pair.

### P1-2 (backend, OPEN): Expo is called inside a DB transaction that holds device locks, so a failed commit can cause a duplicate push

**Where:** `apps/worker/src/weaselplex-request-push.ts:36-71`. The transaction takes `for update of p,d`, increments attempts, POSTs to Expo with a 10 s timeout, writes tickets, then commits.

**Problems:**
- If the commit fails after Expo accepted the batch (connection drop, worker kill), the attempts and ticket writes roll back and the rows stay `pending`, so the BullMQ retry sends again. That breaks the module's own "never resend an ambiguous push" rule.
- Holding device row locks across a network call makes concurrent registrations, which use `lock_timeout='1s'`, fail with 503.

**Fix:** split the send into three steps.
1. Claim in a short transaction: set `state='sending'`, `attempts=attempts+1`, `updated_at=now()`, with `for update skip locked`, then commit.
2. POST to Expo with no transaction open.
3. Record tickets and errors in a second short transaction.

Then:
- add `'sending'` to the state check in `0042`;
- have the receipt sweep move `sending` rows older than 10 minutes to `unknown` (never back to `pending`);
- retry only rows that were definitively retryable, by setting them back to `pending` in step 3.

### P1-3 (backend, OPEN): enabling the worker after a backlog pushes stale events

**Where:**
- The relay branch `apps/worker/src/outbox-relay.ts:~477` re-queues `request_push_disabled` events every 15 minutes indefinitely, without incrementing attempts.
- `deliverRequestPush` has no age check.

**Problem:** Phase 0 requires the owner to verify a real ready and failed event before customer delivery. The natural rollout is ingestion on with the worker off. When the worker is later turned on, every stored event fires at once, possibly days late.

**Fix:**
- In `deliverRequestPush`, skip deliveries whose event `created_at < now() - interval '24 hours'`: insert them as or move them to `skipped` with `last_error_class='stale'`.
- In the relay's disabled branch, dead-letter events older than 24 hours with `last_error_class='request_push_stale'` instead of re-queueing.
- Document the two independent flags in the runbook: `WEASELPLEX_REQUEST_PUSH_ENABLED` is set separately for the web process (`server-env.ts`) and the worker (`config.ts`). Rollout: web on, worker off, verify real events in `weaselplex_request_events`, then turn the worker on.

### P1-4 (backend, OPEN): Valkey failure in the relay rolls back the whole relay batch

**Where:** `outbox-relay.ts:~479`. `requestPushQueue.add(...)` is not caught.

**Problem:** the whole batch of 25 is one transaction. A throw rolls back events in the same batch whose emails were already sent, so those emails go out again. The diagnostics branch has the same existing hazard.

**Fix:** wrap `add` in try/catch. On error, set that event to `state='failed', attempts=attempts+1, available_at=now()+interval '5 minutes', last_error_class='request_push_queue_unavailable'` and `continue`. BullMQ dedupes the deterministic `jobId: outbox-${event.id}` while the job exists. The deliveries table remains the real dedupe after `removeOnComplete`.

### P1-5 (backend, OPEN): authenticated but unexpected webhook events get a 400 and are not stored

**Where:**
- `packages/workflows/src/weaselplex-request-push.ts:35` throws "Unknown request event", and `:37` throws on a title containing control characters.
- `apps/web/src/lib/server/weaselplex-request-push.ts:100-101` maps those throws to 400 before anything is stored.

**Problem:** the plan stores the raw body so a later template fix can re-derive keys. Other events the owner might enable get a 400 and are lost, and so does an odd title. These include MEDIA_AUTO_APPROVED, MEDIA_PENDING, or a 4K TV event whose status does not match.

**Fix:** after the secret check, always persist the event. Return a disposition instead of throwing: `queued | duplicate | ignored | invalid`. Store `raw_body` and `ignored=true` for anything not queued, and reply 200; Seerr never retries anyway. Reply 400 only for unparsable JSON or a body over the size limit, and 401/403 only for a bad secret. Sanitize the title rather than rejecting it: strip `[\x00-\x1f\x7f]`, collapse whitespace, cap at 200 characters, and fall back to "Your request" when empty.

### P1-6 (backend, verify): migration replay list

**Where:** `packages/db/test/full-migration-replay.test.ts:~47`. The expected migration list stops at `0041_media_kid_profiles.sql`.

**Fix:** add `"0042_weaselplex_request_push.sql"`, and add the new tables to its table assertion if that list is exhaustive. Confirm with `schema-smoke.test.ts` that `packages/db/src/schema/request-push.ts` matches the SQL exactly: columns, the partial unique index and the checks. CI (`pre-commit` and DB tests) fails if either check is skipped.

---

## P2: fix in this PR

### P2-1 (phone, OPEN): stale pending keys and the notifications toggle

**Where:** `utils/requestStatus.ts:110-121`, which diverges from the TV's `trackEvents`.

**Problems:**
- A request that goes partial → ready while the app is in an unsafe state, such as playback, keeps both keys pending, so the banner counts two updates for one title.
- With the toggle off, keys still accumulate in `pending` and are all shown once the toggle is turned back on.

**Fix:**
- Before adding a new key, delete every pending key whose second field equals this request ID. After the loop, drop pending keys for fresh rows whose current key differs.
- Pass `enabled` into `reconcileRequestJournal`. When it is false, add new keys to `presented`, not `pending`.
- `setRequestNotificationsEnabled(false)` should move the current `pending` into `presented`.

This mirrors `RequestStatusRepository.kt` `trackEvents` and `setNotificationsEnabled`.

### P2-2 (phone, OPEN): paging assumes the server returns exactly 50 rows

**Where:** `utils/syncOwnRequests.ts:11-16` advances with `skip += 50` and stops when `results.length < 50`.

**Problem:** if Seerr ever caps `take` lower, rows are skipped, yet the sync is reported complete.

**Fix:**
- Use `skip += page.results.length`.
- Stop when `results.length === 0`, or when `pageInfo.results` is known and `skip >= pageInfo.results`, or when `pageInfo.page >= pageInfo.pages`.
- Use `length < take` only when `pageInfo` is missing.
- Keep the 1,000-row cap, and use `complete=false` when it is reached.

### P2-3 (phone, OPEN): every TV request is re-hydrated on every sync

**Where:** `utils/syncOwnRequests.ts:45`. List rows never include `media.seasons`, so every TV row triggers a detail read on each sync. With My requests visible that is every 60 s.

**Fix:** mirror the TV's skip (`RequestStatusRepository.kt`, the `unchanged` block). Reuse the previous seasons without a read when the previous row was fresh, its stage was READY, and these all match the new row:
- `request.updatedAt`;
- `media.updatedAt`;
- `media.status`;
- `media.status4k`.

Also skip declined or failed requests (status 3 or 4) when nothing changed.

### P2-4 (phone, OPEN): an unhydrated TV row with no prior state shows a stage that may be wrong

**Where:** `utils/syncOwnRequests.ts:58`. A row with `!fresh` and no `old` falls back to `deriveRequestStage(request)` without seasons, which yields "Waiting for your library" or a queue stage.

**Fix:** use `stage("CHECKING")` with `fresh:false`, matching the TV's "Checking".

### P2-5 (phone, OPEN): opening My requests does not refresh

**Where:** `RequestStatusProvider.tsx:127` and `MyRequestsPage.tsx:84`. The TV calls `refresh()` when the page becomes visible. On the phone, only the poll interval drops to 60 s, so the data can be up to 30 minutes old when the page opens.

**Fix:** in `setVisible`, when the count goes 0 → 1 and `query.dataUpdatedAt` is more than 60 s old, call `query.refetch()`.

### P2-6 (phone, OPEN): journal arrays grow without limit

**Where:** `utils/requestStatus.ts` (`presented`, `known`, `seeded`). Each MMKV write re-serializes all of them.

**Fix:**
- Remove an ID from `seeded` after its first fresh reconcile, as the TV does.
- Prune `presented` and `pending` keys whose request ID is no longer in `known`.

### P2-7 (backend, OPEN): the push payload uses the wrong URL scheme

**Where:** `packages/workflows/src/weaselplex-request-push.ts:44` sends `url: "weaselplex://search?requestTab=my"`. The app's scheme is `weaselfin` (`app.json:8`; the existing website returns `weaselfin://connected`).

**Fix:** use `weaselfin://search?requestTab=my`, or omit `url` and let the Phase 5 router handle `kind:"request"`. The Phase 5 router must handle cold start either way.

### P2-8 (backend, OPEN): the IP rate-limit key is not validated

**Where:** `apps/web/src/lib/server/weaselplex-request-push.ts:60`. It uses `x-real-ip ?? "unknown"`.

**Fix:** copy the kid adapter (`weaselplex-kids-http.ts:157-158`): `isIP(supplied) === 0 ? "unknown" : supplied`. Note for the owner's deploy check (read-only): confirm that production nginx sets `X-Real-IP $remote_addr` for `/api/v1/weaselplex/`. Otherwise every client shares one bucket of 30 per minute.

### P2-9 (backend, OPEN): the request body is validated after the media-server call

**Where:** `weaselplex-request-push.ts:62-79`. The body is read and validated after `validateUserToken`.

**Fix:** read and validate the body and check that there is no query string before the network call. Keep the IP window first. Return 429 or 409 rather than 503 when the 50-device limit is hit (`:86`).

### P2-10 (docs, OPEN): the webhook Authorization header format

Seerr's Webhook agent sends its "Authorization Header" field verbatim, and the receiver expects exactly `Bearer <secret>`. Write that exact format in the Phase 4 runbook next to the template and `notificationTypes=88`.

### P2-11 (shared fixture, OPEN): missing cases

The required cases are missing from `docs/request-stages.fixture.json`, which both repos use. Add them on the TV side, then copy the file:
- failed → retried → ready;
- season P → A;
- partial → ready, with the pending partial dropped;
- a 4K movie;
- blocklisted versus deleted, including `notify:false` for removal after completion;
- an unhydrated TV list row (Checking, not fresh);
- seeded-before-baseline;
- push-before-poll and poll-before-push sharing one `claimPresentation`.

Add `expectedKey` per case. The phone tests (`utils/requestStatus.test.ts`) should iterate the fixture.

---

## P3: polish or follow-up

- **Phone, probe on a manually configured server:** at `RequestStatusProvider.tsx:89-97`, clear and reconnect only when `settings.jellyseerrServerUrl === WEASEL_SEERR_URL`. For a manual server, show "Requests unavailable" and do not tear down that session; there is no silent reconnect for it.
- **Phone, reconnect path:** `requestWeaselSeerrReconnect` uses the manual-retry gap (3 minutes) instead of the automatic cooldown (15 minutes). The probe's own 15-minute clock bounds this to one reconnect per window, which is acceptable. Note it in the strike-budget comment.
- **Phone, release date:** at `requestStatus.ts:73`, `futureRelease > new Date(now).toISOString().slice(0,10)` compares against the UTC date, so it is off by a day in US evenings. Compare with a local `YYYY-MM-DD`.
- **Phone, banner over the request sheet:** the safe gate does not cover the BottomSheet `RequestModal`. Add a `requestSheetOpen` atom, or reuse the GlobalModal state if the sheet registers with it.
- **Phone, header copy:** `MyRequestsPage.tsx:111` falls back to `request_status.unavailable` ("Not available"). Use a neutral "Requests aren't connected yet" string.
- **Phone, poster URL:** the poster loads directly from `image.tmdb.org`. Use `jellyseerrApi.imageProxy(posterPath, "w185")` like other request cards.
- **Phone, Details route:** Details pushes `/jellyseerr/page` with `{id, mediaType}` only. Pass `mediaTitle`, `releaseYear` and `posterSrc` as the page expects (`jellyseerr/page.tsx:68`), or the header will be blank until the details load.
- **Phone, seed and navigation fallback:** at `useJellyseerr.ts` (`requestMedia`), when the response lacks `requestedBy` and the body had no `userId` override, still treat the request as owned for seeding and navigation.
- **Phone, effect order:** `index.tsx:95-96` references `setSearchType` before its `useState` declaration. It works at runtime, but move it below to satisfy lint.
- **Phone, tab navigation:** check that `router.navigate("/(auth)/(tabs)/(search)", …)` from another tab's pushed `jellyseerr/page` lands on the search index rather than leaving a detail screen on top. Use `dismissTo` if needed.
- **Backend, unused column:** `jellyfin_username` in `0042` is always null and Phase 0 says it must not identify a recipient. Drop it.
- **Backend, event table checks:** add `CHECK ((ignored AND event_key IS NULL) OR (NOT ignored AND event_key IS NOT NULL))`. Add a `created_at` index on `weaselplex_request_events` and a retention purge (for example 90 days) in the receipt sweep, since the raw body contains the requester UUID and the title.
- **Backend, secret file:** `requestPushRuntime()` reads the secret file on every request. Cache it per process. Use a `superRefine` to refuse startup when the flag is on and `WEASELPLEX_REQUEST_WEBHOOK_SECRET_FILE` is missing.
- **Backend, delivery dedupe history:** `weaselplex_push_deliveries.device_id … ON DELETE CASCADE` loses dedupe history when token rotation deletes a row. This is low risk because the old token is dead. Optionally keep an `expo_token` digest with `ON DELETE SET NULL`.
- **Backend, Expo message fields:** add `ttl: 86400` and `priority: "high"`. Leave `channelId` to Phase 5, where it must match the app's channel.
- **Backend, batch size:** one batch is at most 100 rows and devices are capped at 50 per user, so it is fine. Assert that relationship in a comment.

---

## Gates and scope reminders for the PRs

- **Phone PR:** shared TypeScript only, no native changes, so the Android compile gate is not required. The iOS **Check TestFlight from the PR branch and the owner's on-device OK** are required before merge. Record them as **pending (owner away)** in the PR, with no M4 use. Do not merge.
- **Backend PR:** owner-gated deploy. It ships with both flags off. No webhook is configured, no secret is deployed and nobody is notified. Note the P1-3 rollout order and the Phase 0 requirement to verify real ready and failed events before turning the worker on.
- **Phase 5 deferred:** registration calls, the permission prompt, `expo-notifications` native config (`mode: "production"`, `enableBackgroundRemoteNotifications`), the foreground handler and the router. The phone's synchronous `claimRequestPresentation` (MMKV) is already the right shared hook for the push handler.
- No release, tag, merge or customer notification.
