import { expect, mock, test } from "bun:test";
import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

mock.module("react-native", () => ({ PixelRatio: { get: () => 3 } }));
mock.module("@/utils/customHeaders", () => ({
  getJellyfinHeadersForUrl: () => undefined,
}));

const { getItemImage } = await import("@/utils/getItemImage");
const {
  seriesBackdropUrl,
  titleHeaderArt,
  titlePageArtworkUris,
  titlePosterArt,
} = await import("./titlePageArtwork");

const api = { basePath: "https://media.example" } as Api;

test("a movie card names the page's backdrop and poster exactly", () => {
  const card = {
    Id: "m1",
    Type: "Movie",
    ImageTags: { Primary: "p" },
    BackdropImageTags: ["b"],
  } as BaseItemDto;
  // What the page asks for, from the full item
  const full = { ...card, Overview: "…", Genres: ["Drama"] } as BaseItemDto;
  expect(titlePageArtworkUris(api, card)).toEqual([
    getItemImage({ item: full, api, ...titleHeaderArt(full) })!.uri!,
    getItemImage({ item: full, api, ...titlePosterArt() })!.uri!,
  ]);
  expect(titlePageArtworkUris(api, card)[0]).toContain(
    "/Items/m1/Images/Backdrop/0?quality=90&tag=b&width=1000",
  );
});

test("an episode card names the page's still; a show card its backdrop", () => {
  const episode = {
    Id: "e1",
    Type: "Episode",
    ImageTags: { Primary: "p" },
  } as BaseItemDto;
  expect(titlePageArtworkUris(api, episode)).toEqual([
    "https://media.example/Items/e1/Images/Primary?quality=90&tag=p&width=1000",
  ]);
  const show = {
    Id: "s1",
    Type: "Series",
    BackdropImageTags: ["b"],
  } as BaseItemDto;
  expect(titlePageArtworkUris(api, show)).toEqual([
    seriesBackdropUrl(api, show)!,
  ]);
});

test("a card without the image's tag is skipped, never guessed at", () => {
  expect(
    titlePageArtworkUris(api, { Id: "m1", Type: "Movie" } as BaseItemDto),
  ).toEqual([]);
  // A show without a backdrop tag would fall back to another picture
  expect(
    titlePageArtworkUris(api, {
      Id: "s1",
      Type: "Series",
      ImageTags: { Primary: "p" },
    } as BaseItemDto),
  ).toEqual([]);
  expect(
    titlePageArtworkUris(api, {
      Id: "e1",
      Type: "Episode",
      ParentBackdropImageTags: ["b"],
    } as BaseItemDto),
  ).toEqual([]);
});

test("a season, collection or person card downloads nothing", () => {
  for (const Type of ["Season", "BoxSet", "Person", "CollectionFolder"]) {
    expect(
      titlePageArtworkUris(api, {
        Id: "x",
        Type,
        SeriesId: "s1",
        ImageTags: { Primary: "p" },
        BackdropImageTags: ["b"],
      } as BaseItemDto),
    ).toEqual([]);
  }
});
