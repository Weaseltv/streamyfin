import { expect, test } from "bun:test";
import {
  preparationEventIdentity,
  recordForDownloadEvent,
} from "./downloadEventIdentity";

test("late old events cannot complete or remove a newer transfer", () => {
  const current = {
    itemId: "item",
    activityMetadata: { itemId: "item:1791867600000-2" },
  };
  expect(
    recordForDownloadEvent([current], "item:1791867600000-1"),
  ).toBeUndefined();
  expect(
    recordForDownloadEvent([current], current.activityMetadata.itemId),
  ).toBe(current);
  expect(recordForDownloadEvent([current], "item")).toBeUndefined();
  expect(recordForDownloadEvent([{ itemId: "legacy" }], "legacy")?.itemId).toBe(
    "legacy",
  );
});
test("only known generation syntax is eligible for owned late-file cleanup", () => {
  expect(preparationEventIdentity("item:1791867600000-1")).toEqual({
    itemId: "item",
    generation: "1791867600000-1",
  });
  expect(preparationEventIdentity("legacy")).toBeUndefined();
  expect(preparationEventIdentity("item:../../other")).toBeUndefined();
});
