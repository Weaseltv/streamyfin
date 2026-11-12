# Home rows return to the first card

The owner requested every phone Home row start at the beginning on app open,
return to Home, and pull-to-refresh, and show newly added cards from the beginning.
This change uses shared iOS/Android phone code; no stable mobile publication is
included. The previously accepted Continue Watching synchronization fix remains
in the same PR branch.

## Cause and change

Home keeps its horizontal native lists mounted across navigation. FlashList 2 also
[maintains visible content position by default](https://shopify.github.io/flash-list/docs/usage/#maintainvisiblecontentposition),
so prepending fresh cards preserves an old visible card instead of showing the new
first card. No shared Home lifecycle reset previously reached those inner lists.

A phone-Home-only context now issues a reset when Home becomes visible, the app
returns to the foreground, playback finishes closing, the Home tab is reselected,
and pull-to-refresh starts/finishes. Visibility includes the existing playback
refresh hold: no scroll is issued while a native player/closing stack covers Home.
Reset requests wait until the native row is laid out; rows mounted later consume
the current reset. The handler clears a request before issuing the native command,
preventing repeated layout callbacks from recursively scrolling.

Standard paginated rows disable FlashList's automatic position preservation only
inside phone Home. Each row observes ordered item IDs: additions, removals, and
reordering return it to the first item. Appending a fetched pagination page keeps
the viewer's position, and progress/metadata-only updates with unchanged IDs do not
interrupt browsing. No query reset, refetch, Home loading-gate reset, or list remount
is needed for a position change.

Coverage includes Continue Watching/Next Up, Recently Added and library rows,
Streaming Services, curated rows, optional media-list and Streamystats rows,
offline downloads, and the optional featured hero. The hero's page counter also
returns to one. The same reusable list components keep their existing behavior
outside phone Home. The separate Android TV product and tvOS Home are unchanged.

## Validation

Twelve new native-position scheduler regressions plus the 18 existing dismissal,
action-ownership, and playback-refresh checks passed (30 total). They cover cold
and late layout, reset fan-out, queued offscreen resets, reentrant layout callbacks,
data changes, pagination preservation, unchanged IDs, account/row changes, remounts,
and retry after an early native layout failure. These are state/command checks,
not physical phone lifecycle verification. TypeScript and changed-file Biome checks
passed. Production iOS and Android bundles and the new PR-branch Check TestFlight
are recorded below when ready.

Work: source edits, checks, and mobile exports on ThinkCentre. iOS native archive
uses the existing required M4 workflow. Owner iPhone verification is required before
merging these new changes; no Android phone device test is claimed.

Production Metro/Hermes export passed for iOS (3,842 modules) and Android
(3,914 modules). The final TypeScript run and all 13 changed-file Biome checks
passed. The reset uses no new dependency or native module change. The next Check
TestFlight includes the previously accepted account-removal synchronization fix;
mobile merge/publication waits for the owner's verification of this new behavior.
