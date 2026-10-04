import { expect, test } from "bun:test";
import { ItemFields } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient } from "@tanstack/react-query";
import { getReusableItemMetadata } from "./reusableItemMetadata";

const fields = [ItemFields.MediaSources, ItemFields.MediaStreams];
const full = {
  Id: "movie",
  MediaSources: [{ Id: "source", MediaStreams: [] }],
};
function seed(key: unknown[], data: unknown, age = 100) {
  const client = new QueryClient();
  client.setQueryData(key, data, { updatedAt: 100_000 - age });
  return client;
}
test("recent complete DTO is reusable while stale and partial ones are not", () => {
  expect(
    getReusableItemMetadata(
      seed(["item", "movie", fields], full),
      "movie",
      100_000,
    ),
  ).toEqual(full);
  expect(
    getReusableItemMetadata(
      seed(["item", "movie", fields], full, 60_001),
      "movie",
      100_000,
    ),
  ).toBeUndefined();
  expect(
    getReusableItemMetadata(
      seed(["item", "movie", fields], { Id: "movie" }),
      "movie",
      100_000,
    ),
  ).toBeUndefined();
});
test("People and abbreviated DTOs never satisfy playback metadata", () => {
  expect(
    getReusableItemMetadata(
      seed(["item", "movie", "people"], [{ Id: "person" }]),
      "movie",
      100_000,
    ),
  ).toBeUndefined();
  expect(
    getReusableItemMetadata(
      seed(["item", "movie", [ItemFields.Overview]], full),
      "movie",
      100_000,
    ),
  ).toBeUndefined();
  expect(
    getReusableItemMetadata(
      seed(["item", "movie", fields], { ...full, Id: "other" }),
      "movie",
      100_000,
    ),
  ).toBeUndefined();
});
test("server invalidation and missing stream identity force a fresh DTO", () => {
  const client = seed(["item", "movie", fields], full);
  void client.invalidateQueries({ queryKey: ["item", "movie"] });
  expect(getReusableItemMetadata(client, "movie", 100_000)).toBeUndefined();
  expect(
    getReusableItemMetadata(
      seed(["item", "movie", fields], {
        Id: "movie",
        MediaSources: [{ MediaStreams: [] }],
      }),
      "movie",
      100_000,
    ),
  ).toBeUndefined();
});
