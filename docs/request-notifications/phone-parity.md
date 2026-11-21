# Requests on phones: parity with the WeaselPlex TV app

The phone apps get the TV's Requests queue: the member's own requests in Active, Waiting and Ready to
watch, with live stages and progress, cancel, the "ready" card, the unread badge and the "Request sent"
flow. The plan of record is the Notion page "WeaselPlex phones: requests live status and queue (TV
parity): agreed plan" (agreed 2026-11-21, with the Unraid operator's answers written in).

**Reference:** the TV app's code, Wholphin `weaselfin` d6990c35 (v1.2.49), not its older docs. When the
TV changes, re-diff the files below before the next phone change. If a phone test disagrees with the TV
code, the TV code wins and the TV thread is told.

## Where each TV piece lives on the phone

All logic is pure TypeScript in `utils/requestStatus/`, with a test file for each module. Nothing there
imports React Native, MMKV or i18next; wording comes back as `request_status.*` keys.

| TV (Wholphin `app/src/main/java/com/github/damontecres/wholphin/`) | Phone |
| --- | --- |
| `services/RequestStage.kt` (`deriveRequestStage`, `eventKey`) | `stage.ts` |
| `services/RequestStatusRepository.kt` `requestPresentationKey` | `stage.ts` `presentationKey` |
| `services/RequestStatusRepository.kt` `trackEvents`, `seed`, `markOpened`, `setNotificationsEnabled`, `delivered`, `forgetLocked` | `journal.ts` |
| `services/RequestStatusRepository.kt` `sync`, `refreshRequest`, `libraryItemId` | `sync.ts` |
| `services/RequestProgressRepository.kt` `RequestProgressRecord` (`valid`, `matches`, `stageLabel`, `fraction`) | `progressRecord.ts` |
| `services/RequestProgressRepository.kt` `apply` | `progressReducer.ts` |
| OkHttp's event-source parser | `sse.ts` |
| `ui/discover/SeerrRequestsPage.kt` `activityRow`, `airingRow`, section order | `activityRow.ts`, `format.ts` |
| `ui/detail/discover/RequestSubmissionError.kt` | `submissionError.ts` |
| `services/SeerrKidGuard.kt` | `visibility.ts` `isConfirmedAdult` |

`request-stages.fixture.json` is copied unchanged from the TV (`docs/request-stages.fixture.json`) and
`stage.test.ts` runs every case. `progress-envelopes.fixture.json` holds the progress service's sample
envelopes from the Unraid operator (2026-11-21), plus one ordinary ready record the samples lacked.

## Deliberate differences from the TV

| TV | Phone | Why |
| --- | --- | --- |
| Reads `/snapshot` every second whenever the stream has had no event for a second | No reads while the stream is healthy; `/snapshot` every 2 s only when the stream can't be used | Asked for by the Unraid operator: the service pushes every change within about a second, and NC1 limits each home to 10 requests a second |
| An event with another `boot` is dropped until the next once-a-second read repairs it | After the attempt's first snapshot, another `boot` ends the stream; the reopened stream starts with its own snapshot | Without the once-a-second read, the stream would otherwise stay stuck |
| Any cancel 409 shows "This title is already ready to watch." | The answer's reason is read: "can no longer be cancelled", "already being cancelled" and the 4K case each have their own line | The service gives three reasons, and one covers a declined request |
| Cancel 404 forgets the row at once | One verifying read through the request server first | Protects the row's unread and pending state |
| A 403 on a live read is a sign-in problem | Treated as a refusal by the proxy: retried later, no sign-in check | The service never answers 403 on reads; saves sign-in checks against the home's failed sign-in limit |
| Requests is a side-menu item | Requests is a bottom tab, with the badge | Phone navigation |
| No system notifications | A phone notification when a request is ready or couldn't be added | Phones are not always on the app |

The cancel request sends `X-WeaselPlex-Client: tv`. The service accepts only that exact value (the header
is cross-site protection only and is neither logged nor used), so phones send it from one named constant.

## Progress service facts (from the Unraid operator, 2026-11-21)

- Routes: `GET /progress/v1/stream` (SSE), `GET /progress/v1/snapshot`, `POST /progress/v1/requests/{id}/cancel`,
  on `https://requests.theweasel.tv`, authenticated by the request server's `connect.sid` cookie (`Path=/`).
- The stream opens with `retry: 2000`, then a `snapshot` (up to about 5 s); `: ping` every 15 s.
- `rev` is one counter for the whole service: gaps are normal; compare only within one `boot`.
- `status` carries `auth` only: `revalidating` holds updates; `ok` is followed by a fresh `snapshot`.
  `auth_expired` is followed by the stream closing.
- `remove.reason` is `deleted` or `aged_out` (a finished record 24 hours after its last change).
- Read routes answer `401 {"error":"signed_out"}` or `503 {"error":"seerr_unreachable"}` with
  `Retry-After: 5`; never 403. A refusal by NC1's proxy has no JSON body.
- Only an open stream makes the service check the request server quickly (every 2 to 6 s); with
  `/snapshot` alone those checks run every 60 s. Download progress stays at 1 to 2 s either way.
