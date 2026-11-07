# Continue Watching / Next Up removal sync

## Cause

The customer Android TV app stores removed series on Jellyfin in display preferences
`default`, client `Wholphin`, custom preference `removeNextUp`. `LatestNextUpService`
uses those entries to filter Next Up. Alpha previously used client `Wholphin (Debug)`
through `DisplayPreferencesService.DEFAULT_CLIENT`, so the two TV builds read different
lists even for the same member.

The iOS and Android phone product shares `utils/atoms/dismissedNextUp.ts` in
Weaseltv/streamyfin. Its previous dismissal action only updated the device's MMKV
`dismissedNextUpSeries` atom. It neither read TV removals nor wrote its own removal to
Jellyfin. Watched/resume changes use Jellyfin separately; apparent synchronization
of those changes does not establish synchronization of this local dismissal list.
The owner confirmed using **Remove from Continue & Next Up** on iPhone. The reported
reverse-direction disappearance was not reproduced on devices in this investigation;
the old mobile action's source contains no server write.

These are client storage/refresh problems. No media server, Jellyfin or nginx
configuration change is required. The phone bug affects both iOS and Android phone.

## Shared contract and migration

All updated clients read and write the customer's existing storage:

- `GET` / `POST /DisplayPreferences/default?userId=<member>&client=Wholphin`
- Preserve the complete display-preferences DTO and all unrelated `CustomPrefs` keys.
- `CustomPrefs.removeNextUp` is a JSON **string** with the existing TV format:

```json
{"value":{"00000000-0000-0000-0000-000000000001":"2026-11-07T10:00:00.123"}}
```

New timestamps use UTC, serialized without an offset for compatibility with TV's
existing `LocalDateTime` serializer. Phone IDs normalize compact/dashed UUIDs and
case, and writes use dashed UUIDs accepted by the Kotlin serializer.

Alpha imports its old list once, merging the newest timestamp per series into the
shared list. A marker in the old Alpha namespace prevents a restored series being
imported again, including after app restart. Migration memory is scoped by server
and user. Home layout/debug preferences keep their existing separate behavior;
only the dismissal list is shared.

The mobile change imports the signed-in member's old device-only dismissals on the
first successful sync, then clears those migrated local entries only after the
server accepts them. Failed saves remain retryable. Subsequent reads use the shared
list. Requests and query caches are scoped by server and member; late callbacks
cannot update a newly signed-in account. Local read/modify/write operations are
serialized and every mutation reads fresh server preferences.

Both Resume and Next Up episode feeds apply dismissals. Movie/library browsing is
unaffected. Removing a series preserves watched state and resume progress. Explicit
play or marking played clears its shared dismissal; later playback timestamps also
allow resumed episodes. Background cleanup checks timestamps again before deleting
entries so a newer removal saved during its scan is retained.

Mobile Home refetches the list on foreground/focus, explicit refresh, and every
30 seconds while Home is active. TV Home reads the shared list when loading its
rows; its existing refresh/navigation behavior remains in place.

## Validation and delivery

Work stayed on ThinkCentre (`justin-ThinkCentre-M73`). No live member list was
modified for investigation, no device navigation/playback tests were run, and no
stable release was published. Phone API tests use an in-memory server; TV tests use
server-backed preference fixtures. Alpha install and native iPhone verification
are recorded when complete.

Mobile validation on ThinkCentre: nine new shared-storage regressions and nine
existing action-ownership/playback-refresh regressions passed (18 total). TypeScript
and changed-file Biome checks passed. Production Metro/Hermes exports passed for
both iOS (3,838 modules) and Android (3,910 modules). No native module or dependency
changes were needed. This establishes shared Android phone source/bundle coverage,
not an Android phone device test. The owner does not currently have an Android phone.

The matching TV change and Alpha delivery are tracked in
[the TV runbook](https://github.com/Weaseltv/Wholphin/blob/t3/weaselplex-preload/runbooks/continue-watching-sync.md).
A PR-branch Check TestFlight and owner iPhone verification are required before merging
this mobile change. Existing iPhone builds keep their old local-only behavior until
an updated build is installed.
