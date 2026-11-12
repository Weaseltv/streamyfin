import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemImage } from "@/utils/getItemImage";
import { imageWidthFor } from "@/utils/imageSizes";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";

/**
 * The artwork at the top of a title page, described in one place. The pages
 * draw from these and the tap on a card starts downloading from these, so
 * both ask the server for the very same address and the page finds its
 * artwork already on the way (or already there).
 */

/** Movie and episode pages: the picture behind the title. */
export const titleHeaderArt = (item: Pick<BaseItemDto, "Type">) =>
  ({
    variant: item.Type === "Movie" ? "Backdrop" : "Primary",
    quality: 90,
    width: 1000,
  }) as const;

/** Movie pages: the 108 pt poster beside the title. */
export const titlePosterArt = () =>
  ({ variant: "Primary", quality: 90, width: imageWidthFor(108) }) as const;

/** Show pages: the backdrop's address. */
export const seriesBackdropUrl = (
  api: Api | null | undefined,
  item: BaseItemDto | null | undefined,
) => getBackdropUrl({ api, item, quality: 90, width: 1000 });

/**
 * The addresses the page opened by tapping `item`'s card will request for its
 * top artwork. Only those the card can name exactly: the address carries the
 * image's tag, so a card without the tag is skipped rather than guessed at
 * (a guess would download a picture the page never shows). A season's card
 * opens its show, whose artwork the season does not carry.
 */
export function titlePageArtworkUris(api: Api, item: BaseItemDto): string[] {
  const uris: (string | null | undefined)[] = [];
  if (item.Type === "Series") {
    if (item.BackdropImageTags?.[0]) uris.push(seriesBackdropUrl(api, item));
  } else if (item.Type === "Movie") {
    if (item.BackdropImageTags?.[0])
      uris.push(getItemImage({ item, api, ...titleHeaderArt(item) })?.uri);
    if (item.ImageTags?.Primary)
      uris.push(getItemImage({ item, api, ...titlePosterArt() })?.uri);
  } else if (item.Type === "Episode") {
    if (item.ImageTags?.Primary)
      uris.push(getItemImage({ item, api, ...titleHeaderArt(item) })?.uri);
  }
  return uris.filter((uri): uri is string => !!uri);
}
