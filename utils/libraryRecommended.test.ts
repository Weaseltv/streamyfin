import { describe, expect, test } from "bun:test";
import { uniqueRowIds } from "./libraryRecommended";

describe("uniqueRowIds", () => {
  test("rows keep their own name and order when no two share one", () => {
    const keys = ["released", "added", "suggestions", "top10-nfx", "top10-dnp"];
    expect(uniqueRowIds(keys)).toEqual(keys);
  });
  test("a second row with the same name gets its position, the first keeps the name", () => {
    expect(
      uniqueRowIds(["released", "top10-mxx", "top10-nfx", "top10-mxx"]),
    ).toEqual(["released", "top10-mxx", "top10-nfx", "top10-mxx#3"]);
  });
  test("never hands out the same identity twice", () => {
    const ids = uniqueRowIds(["a", "a", "a#1", "a", "a#1"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
