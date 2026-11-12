import { expect, test } from "bun:test";
import { MediaStreamType } from "@jellyfin/sdk/lib/generated-client/models";
import { reconcileItemPlayOptions } from "./itemPlayOptions";

const first = { Id: "first", MediaStreams: [] };
const chosen = {
  Id: "chosen",
  MediaStreams: [
    { Type: MediaStreamType.Audio, Index: 4 },
    { Type: MediaStreamType.Subtitle, Index: 7 },
  ],
};
const bitrate = { key: "Max", value: undefined };
const defaults = {
  mediaSource: first,
  bitrate,
  audioIndex: 1,
  subtitleIndex: -1,
};
const selection = {
  ...defaults,
  mediaSource: chosen,
  audioIndex: 4,
  subtitleIndex: 7,
};
test("refresh retains the selected source and tracks while replacing its DTO", () => {
  const refreshed = { ...chosen, Name: "Fresh source metadata" };
  expect(
    reconcileItemPlayOptions(selection, defaults, [first, refreshed], true),
  ).toEqual({ ...selection, mediaSource: refreshed });
  expect(
    reconcileItemPlayOptions(selection, defaults, [first, chosen], true),
  ).toBe(selection);
});
test("unedited preferences update, identical defaults preserve state", () => {
  expect(reconcileItemPlayOptions(defaults, defaults, [first], false)).toBe(
    defaults,
  );
  const changed = { ...defaults, subtitleIndex: 2 };
  expect(reconcileItemPlayOptions(defaults, changed, [first], false)).toBe(
    changed,
  );
});
test("a removed chosen source falls back to the new playable defaults", () => {
  expect(reconcileItemPlayOptions(selection, defaults, [first], true)).toBe(
    defaults,
  );
});
