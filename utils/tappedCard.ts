import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { STREAMING_COLLECTION_TAG } from "@/utils/streamingCollections";

/**
 * The card a viewer tapped, kept for the page that tap opens (phones).
 *
 * A show, movie or episode page draws its title, artwork and year from the
 * card at once and fills in when the server's details arrive; a streaming
 * service's page reads its name, description and tags from the card and so
 * starts loading its titles straight away.
 *
 * Kept in memory only, in a list of its own. A card is never written into the
 * query cache and never saved: it is not the item, and code that reads the
 * cached item (playback, downloads, Played, Watchlist) must only ever find
 * what the server sent.
 */

/** The page a card can open on. */
export type TappedCardPage = "series" | "item" | "collection";

/**
 * Which page `item`'s card may stand in on, if any. A season opens its show,
 * which it is not, so it stands in for nothing. A collection qualifies only
 * when its card says it is a streaming service: the Collections grid's cards
 * come without tags and cannot tell the page what kind of collection it is.
 */
export function tappedCardPage(
  item: Pick<BaseItemDto, "Id" | "Type" | "Tags">,
): TappedCardPage | null {
  if (!item.Id) return null;
  if (item.Type === "Series") return "series";
  if (item.Type === "Movie" || item.Type === "Episode") return "item";
  if (
    item.Type === "BoxSet" &&
    item.Tags?.includes(STREAMING_COLLECTION_TAG) === true
  )
    return "collection";
  return null;
}

/**
 * All a title page may draw from a card. Nothing a control acts on is here:
 * no media sources or streams, no watched or watchlist state, no trailers.
 * So a preview cannot play, download or toggle anything even by mistake.
 */
const PREVIEW_FIELDS = [
  "Id",
  "Type",
  "Name",
  "OriginalTitle",
  "SeriesId",
  "SeriesName",
  "IndexNumber",
  "IndexNumberEnd",
  "ParentIndexNumber",
  "ProductionYear",
  "PremiereDate",
  "StartDate",
  "EndDate",
  "RunTimeTicks",
  "OfficialRating",
  "CommunityRating",
  "CriticRating",
  "Genres",
  "Overview",
  "ImageTags",
  "BackdropImageTags",
  "ImageBlurHashes",
  "ParentBackdropItemId",
  "ParentBackdropImageTags",
] as const satisfies readonly (keyof BaseItemDto)[];

/** A card reduced to what a title page draws. Only the fields it has. */
export type TitlePreview = Pick<BaseItemDto, (typeof PREVIEW_FIELDS)[number]>;

export function titlePreview(card: BaseItemDto): TitlePreview {
  const preview: Record<string, unknown> = {};
  for (const field of PREVIEW_FIELDS) {
    const value = card[field];
    if (value !== undefined && value !== null) preview[field] = value;
  }
  return preview as TitlePreview;
}

/** The last few taps. A page takes its card as it mounts and keeps it. */
const HELD_CARDS = 8;
const held = new Map<string, { page: TappedCardPage; card: BaseItemDto }>();

/**
 * Keep `item`'s card for the page its tap opens. Returns the value for the
 * navigation's `card` parameter (the item's id), or undefined when the card
 * stands in for nothing and the navigation goes out as it always has.
 */
export function holdTappedCard(item: BaseItemDto): string | undefined {
  const page = tappedCardPage(item);
  if (!page || !item.Id) return undefined;
  held.delete(item.Id);
  held.set(item.Id, {
    page,
    card: page === "collection" ? item : titlePreview(item),
  });
  while (held.size > HELD_CARDS) {
    const oldest = held.keys().next().value;
    if (oldest === undefined) break;
    held.delete(oldest);
  }
  return item.Id;
}

/**
 * The card for the page showing `id`, or undefined. `cardParam` is the
 * navigation's `card` parameter: only a tap on a card sets it, and it names
 * the tapped item. A page reached any other way (a link, a notification, the
 * episode strip changing the page's id) has no card, or one for another id,
 * and gets nothing here.
 */
export function tappedCardFor(
  page: TappedCardPage,
  id: string | null | undefined,
  cardParam: string | null | undefined,
): BaseItemDto | undefined {
  if (!id || cardParam !== id) return undefined;
  const entry = held.get(id);
  if (!entry || entry.page !== page || entry.card.Id !== id) return undefined;
  return entry.card;
}

/** Tests only. */
export function forgetTappedCards() {
  held.clear();
}

export type TitleDetailsState = "ready" | "loading" | "failed";

/**
 * Where a title page's own details stand. `details` is what the server sent
 * for this title and nothing else, never a card.
 *
 * Ready means the details are here. It is not read from the request having
 * finished, or from there being something to draw: a page drawing a card has
 * both without having the details. A request that ended with nothing (an
 * error, an empty answer, no connection) has failed; it is not still loading.
 */
export function titleDetailsState(query: {
  details: unknown;
  status: "pending" | "error" | "success";
  fetchStatus: "fetching" | "paused" | "idle";
  /** How many times the request has ended in an error (React Query's count). */
  errorUpdateCount?: number;
}): TitleDetailsState {
  if (query.details) return "ready";
  // Asking again after an error puts a request with no data back to
  // "pending". It has still failed until details arrive: the page keeps its
  // error and Retry (shown busy) instead of swapping back to placeholders.
  if ((query.errorUpdateCount ?? 0) > 0) return "failed";
  if (query.status === "pending" && query.fetchStatus !== "paused")
    return "loading";
  return "failed";
}
