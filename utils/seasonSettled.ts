/**
 * Whether the show page's season has been drawn, or never will be.
 *
 * Work that should not compete with the season on screen (the whole-show
 * episode list, More Like This) waits for this. It must also turn true when
 * there is nothing to wait for, or that work would never start: a show with
 * no seasons, a season list that failed, a remembered season the server no
 * longer has.
 */
export function isSeasonSettled({
  seasonsPending,
  seasonCount,
  seasonChosen,
  seasonFound,
  episodesPending,
}: {
  /** The season list has neither arrived nor failed. */
  seasonsPending: boolean;
  /** How many seasons the list holds. */
  seasonCount: number;
  /** A season is remembered, linked to, or has been picked. */
  seasonChosen: boolean;
  /** The chosen season is in the list, so its episodes are asked for. */
  seasonFound: boolean;
  /** The chosen season's episodes have neither arrived nor failed. */
  episodesPending: boolean;
}): boolean {
  if (seasonsPending) return false;
  if (seasonCount === 0) return true;
  // The first season is picked in the render after the list arrives
  if (!seasonChosen) return false;
  if (!seasonFound) return true;
  return !episodesPending;
}
