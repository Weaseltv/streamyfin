import { expect, test } from "bun:test";
import { isPendingTile, nearLoadedEnd, pagedGridAhead } from "./pagedGrid";

const page = (start: number, count: number, total?: number) => ({
  Items: Array.from({ length: count }, (_, index) => ({
    Id: `title-${start + index}`,
  })),
  TotalRecordCount: total,
  StartIndex: start,
});

test("nothing is drawn ahead before the first page or after the last", () => {
  expect(pagedGridAhead(undefined, 60, true)).toEqual({
    firstIndex: 0,
    pending: [],
  });
  const all = { pages: [page(0, 40, 40)], pageParams: [0] };
  expect(pagedGridAhead(all, 60, false).pending).toEqual([]);
});

test("one page of tiles follows the loaded titles, keyed by list position", () => {
  const data = {
    pages: [page(0, 60, 1890), page(60, 60, 1890)],
    pageParams: [0, 60],
  };
  const { firstIndex, pending } = pagedGridAhead(data, 60, true);
  expect(firstIndex).toBe(0);
  expect(pending).toHaveLength(60);
  expect(pending[0].Id).toBe("pending:120");
  expect(pending.at(-1)?.Id).toBe("pending:179");
  expect(pending.every(isPendingTile)).toBe(true);
  expect(isPendingTile({ Id: "title-3" })).toBe(false);
});

test("the tiles never run past the end of the list", () => {
  const data = { pages: [page(0, 60, 75)], pageParams: [0] };
  const { pending } = pagedGridAhead(data, 60, true);
  expect(pending.map((tile) => tile.Id)).toEqual(
    Array.from({ length: 15 }, (_, index) => `pending:${60 + index}`),
  );
});

test("after a jump to a letter the first loaded title keeps its list position", () => {
  const data = {
    pages: [page(540, 60, 1890), page(600, 60, 1890)],
    pageParams: [540, 600],
  };
  const { firstIndex, pending } = pagedGridAhead(data, 60, true);
  expect(firstIndex).toBe(540);
  expect(pending[0].Id).toBe("pending:660");
});

test("a page with no total still gets a page of tiles while more may follow", () => {
  const data = { pages: [page(0, 18)], pageParams: [0] };
  expect(pagedGridAhead(data, 18, true).pending).toHaveLength(18);
});

test("the next page is asked for well before the last loaded title is reached", () => {
  // 60 loaded: 20 rows of 3. Ask once row 8 or later is on screen.
  expect(nearLoadedEnd(11, 60, 60)).toBe(false);
  expect(nearLoadedEnd(24, 60, 60)).toBe(true);
  // Standing on tiles past the loaded titles keeps asking.
  expect(nearLoadedEnd(70, 60, 60)).toBe(true);
  // A small-page collection asks a few rows from its end.
  expect(nearLoadedEnd(5, 18, 18)).toBe(false);
  expect(nearLoadedEnd(8, 18, 18)).toBe(true);
});
