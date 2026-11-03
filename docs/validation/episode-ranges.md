# Combined episode ranges (2026-11-02)

Jellyfin stores a combined episode as one item/file. Its inclusive range is
`IndexNumber` through `IndexNumberEnd` when the latter is greater than the former.
The app now renders that range using `utils/episodes.ts`. Other surfaces keep
their existing separator and padding; the phone rows use the approved pills below.

## Approved phone row design (2026-11-03)

The owner approved the fourth mockup: compact, subdued `EP 1–2` / `EP 3` pills
in a fixed 52-point column to the left of the episode thumbnails. The column and
thumbnail cannot shrink, so both single episodes and long ranges keep the same
thumbnail/title alignment. The pill is constrained to one line and fits long
ranges by reducing its text size, including the app's inline typography scale.
Titles allow two lines; air date/runtime can wrap to two lines on narrow phones.

Per-row download buttons and their unused sheet state/component are removed.
Season download and watched-status controls remain in the season header; an
individual episode can still be downloaded from its detail screen. Both iOS and
Android phone use this same component, including the offline series view.
Other screens retain their existing number format; only the new pills use an
en dash. The range/count/navigation and watched/resume behavior is unchanged.

## Screens and presentation

- Season episode rows (number column expands for ranges), series Next Up, and
  episode-detail season carousel.
- Home Continue Watching / Next Up / Recently Added captions and hero labels;
  the same shared card captions cover search, favorites, and library results.
- Episode-detail heading, Sessions' now-playing episode, and player overlays and
  episode menus.
- Native iOS player metadata/Control Center, up-next/autoplay subtitle and episode
  menu. Episode menu titles are formatted before crossing the native bridge, so
  the existing numeric-only Swift record cannot discard the end of the range.
- Downloads' episode rows, active download cards, completion/failure notifications,
  exported filenames and iOS download Live Activity.
- Corresponding TV components in this repository and tvOS discovery labels reuse
  the helper as well. This does not change the separate Android TV product.

Series/season/download episode totals count unique covered numbers per
series/season, including overlaps only once. Download queues and file operations
still operate on one item per file. There is no local missing-number detector.
Detail next/previous navigation now shares the player's item-ID-based adjacency
instead of using `IndexNumber` as a list offset. Player adjacency was extracted
without changing its order or virtual-item handling. Sorting, shuffle order,
playback requests, watched-state reporting and resume storage are unchanged.

## Live-server checks

Read-only validation used the normal Items, Episodes and NextUp endpoints with no
extra Fields parameter. The installed `@jellyfin/sdk` 0.13 model declares
`IndexNumberEnd?: number | null`; real SDK Items/Episodes responses retain it.
Downloads store the full DTO through JSON, retaining the field offline.

| Dataset | Files | Combined files | Covered episodes | Label check |
| --- | ---: | ---: | ---: | --- |
| Regular Show S4 | 36 | 1 | 37 | `1-2`, then `3`, `4`, `5` |
| Regular Show S3 | 21 | 18 | 39 | Includes `6-7` |
| Paw Patrol | 274 | 172 | 446 | All 172 ranges format correctly |
| Regular Show S1 | 12 | 0 | 12 | All labels exactly match the old single-episode form |

The first S4 item's title is `Exit 9B / Starter Pack`, season 4, start 1, end 2.
The server's adjacent-items response identifies episode 3 as the next file.
The validation account's actual NextUp is S1:E1; the range case is covered by
regression fixtures without changing account watched state to manufacture NextUp.

## Validation and remaining device evidence

- 372 unit tests pass, including 11 new range/count/adjacency regressions.
- TypeScript, Biome checks, and production Metro/Hermes exports for both iOS and
  Android pass.
- The translation check reports no missing keys. Its seven unused-key findings
  are identical on `origin/weaselfin`; the new episode-pill key is referenced.
- Live server response assertions pass for every item in the four datasets.
- The owner will handle app screenshots and waived agent capture on 2026-11-02.
  Agent screenshot capture is no longer an outstanding requirement.
- A PR-branch Check TestFlight and owner iPhone verification are required before
  merge. This change contains no native Kotlin/JNI edits.
