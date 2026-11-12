import { beforeEach, expect, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { STREAMING_COLLECTION_TAG } from "@/utils/streamingCollections";
import {
  forgetTappedCards,
  holdTappedCard,
  tappedCardFor,
  tappedCardPage,
  titleDetailsState,
  titlePreview,
} from "./tappedCard";

beforeEach(forgetTappedCards);

const show = {
  Id: "s1",
  Type: "Series",
  Name: "Severance",
  ProductionYear: 2022,
  BackdropImageTags: ["b"],
  ImageTags: { Primary: "p" },
} as BaseItemDto;

test("a show, a movie and an episode stand in on their own pages", () => {
  expect(tappedCardPage(show)).toBe("series");
  expect(tappedCardPage({ Id: "m1", Type: "Movie" })).toBe("item");
  expect(tappedCardPage({ Id: "e1", Type: "Episode" })).toBe("item");
});

test("a season never stands in for its show, nor other kinds for anything", () => {
  const season = {
    Id: "se1",
    Type: "Season",
    SeriesId: "s1",
    IndexNumber: 2,
  } as BaseItemDto;
  expect(tappedCardPage(season)).toBeNull();
  expect(holdTappedCard(season)).toBeUndefined();
  // Not even when the show's own card was tapped earlier
  holdTappedCard(show);
  expect(tappedCardFor("series", "s1", undefined)).toBeUndefined();
  expect(tappedCardFor("series", "s1", "se1")).toBeUndefined();

  expect(tappedCardPage({ Id: "p1", Type: "Person" })).toBeNull();
  expect(tappedCardPage({ Id: "v1", Type: "Video" })).toBeNull();
  expect(tappedCardPage({ Type: "Movie" })).toBeNull();
});

test("a collection stands in only when its card says it is a streaming service", () => {
  expect(tappedCardPage({ Id: "c1", Type: "BoxSet" })).toBeNull();
  expect(tappedCardPage({ Id: "c1", Type: "BoxSet", Tags: [] })).toBeNull();
  expect(
    tappedCardPage({ Id: "c1", Type: "BoxSet", Tags: ["Marvel"] }),
  ).toBeNull();
  expect(
    tappedCardPage({
      Id: "c1",
      Type: "BoxSet",
      Tags: [STREAMING_COLLECTION_TAG],
    }),
  ).toBe("collection");
});

test("the page opened by the tap gets the card; any other entry gets nothing", () => {
  expect(holdTappedCard(show)).toBe("s1");
  expect(tappedCardFor("series", "s1", "s1")?.Name).toBe("Severance");
  // A link or notification carries no `card` parameter
  expect(tappedCardFor("series", "s1", undefined)).toBeUndefined();
  // The episode strip changes the page's id and leaves `card` as it was
  expect(tappedCardFor("series", "s2", "s1")).toBeUndefined();
  // The wrong page for this card
  expect(tappedCardFor("item", "s1", "s1")).toBeUndefined();
  expect(tappedCardFor("collection", "s1", "s1")).toBeUndefined();
  // Nothing was tapped for this id
  expect(tappedCardFor("item", "m9", "m9")).toBeUndefined();
});

test("a title's card is cut down to what a page draws", () => {
  const card = {
    Id: "m1",
    Type: "Movie",
    Name: "Heat",
    ProductionYear: 1995,
    RunTimeTicks: 102_000_000_000,
    ImageTags: { Primary: "p" },
    BackdropImageTags: ["b"],
    Overview: null,
    UserData: { Played: true, IsFavorite: true, PlaybackPositionTicks: 5 },
    MediaSources: [{ Id: "src" }],
    MediaStreams: [{ Index: 0 }],
    RemoteTrailers: [{ Url: "https://example.test/t" }],
    CanDownload: true,
  } as BaseItemDto;
  holdTappedCard(card);
  const held = tappedCardFor("item", "m1", "m1")!;
  expect(held).toEqual({
    Id: "m1",
    Type: "Movie",
    Name: "Heat",
    ProductionYear: 1995,
    RunTimeTicks: 102_000_000_000,
    ImageTags: { Primary: "p" },
    BackdropImageTags: ["b"],
  });
  // Nothing a control acts on, and no field the card lacked
  expect(held.UserData).toBeUndefined();
  expect(held.MediaSources).toBeUndefined();
  expect("Overview" in held).toBe(false);
  expect("Genres" in titlePreview(card)).toBe(false);
  // The card itself is left as it was
  expect(card.UserData?.Played).toBe(true);
});

test("a streaming service's card is kept whole", () => {
  const service = {
    Id: "c1",
    Type: "BoxSet",
    Name: "Netflix",
    Overview: "Netflix in WeaselPlex",
    Tags: [STREAMING_COLLECTION_TAG],
    ChildCount: 1890,
  } as BaseItemDto;
  expect(holdTappedCard(service)).toBe("c1");
  expect(tappedCardFor("collection", "c1", "c1")).toBe(service);
});

test("only the last few taps are kept", () => {
  for (let i = 0; i < 12; i++)
    holdTappedCard({ Id: `m${i}`, Type: "Movie" } as BaseItemDto);
  expect(tappedCardFor("item", "m0", "m0")).toBeUndefined();
  expect(tappedCardFor("item", "m3", "m3")).toBeUndefined();
  expect(tappedCardFor("item", "m4", "m4")?.Id).toBe("m4");
  expect(tappedCardFor("item", "m11", "m11")?.Id).toBe("m11");
  // Tapping a card again keeps it among the newest
  holdTappedCard({ Id: "m4", Type: "Movie" } as BaseItemDto);
  holdTappedCard({ Id: "m12", Type: "Movie" } as BaseItemDto);
  expect(tappedCardFor("item", "m4", "m4")?.Id).toBe("m4");
  expect(tappedCardFor("item", "m5", "m5")).toBeUndefined();
});

test("details are ready only when they are here", () => {
  const details = { Id: "m1" };
  expect(
    titleDetailsState({ details, status: "success", fetchStatus: "idle" }),
  ).toBe("ready");
  // Still ready while a refresh runs or after one fails
  expect(
    titleDetailsState({ details, status: "success", fetchStatus: "fetching" }),
  ).toBe("ready");
  expect(
    titleDetailsState({ details, status: "error", fetchStatus: "idle" }),
  ).toBe("ready");
});

test("a finished request without details has failed, it is not ready", () => {
  // The server answered with nothing: success is not readiness
  expect(
    titleDetailsState({
      details: null,
      status: "success",
      fetchStatus: "idle",
    }),
  ).toBe("failed");
  expect(
    titleDetailsState({
      details: undefined,
      status: "error",
      fetchStatus: "idle",
    }),
  ).toBe("failed");
  // Retrying after a failure stays a failure until details arrive
  expect(
    titleDetailsState({
      details: undefined,
      status: "error",
      fetchStatus: "fetching",
    }),
  ).toBe("failed");
  // Asked again after an error: React Query reports "pending" once more
  expect(
    titleDetailsState({
      details: undefined,
      status: "pending",
      fetchStatus: "fetching",
      errorUpdateCount: 1,
    }),
  ).toBe("failed");
  // No connection: the request is parked, not under way
  expect(
    titleDetailsState({
      details: undefined,
      status: "pending",
      fetchStatus: "paused",
    }),
  ).toBe("failed");
});

test("a request under way, or not started yet, is loading", () => {
  expect(
    titleDetailsState({
      details: undefined,
      status: "pending",
      fetchStatus: "fetching",
    }),
  ).toBe("loading");
  expect(
    titleDetailsState({
      details: undefined,
      status: "pending",
      fetchStatus: "idle",
    }),
  ).toBe("loading");
});
