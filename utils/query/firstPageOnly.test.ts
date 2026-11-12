import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { holdsSinglePage, trimToFirstPage } from "./firstPageOnly";

const paged = (count: number) => ({
  pages: Array.from({ length: count }, (_, index) => ({ Items: [index] })),
  pageParams: Array.from({ length: count }, (_, index) => index * 18),
});

test("a list with no data or one page counts as a single page", () => {
  expect(holdsSinglePage(undefined)).toBe(true);
  expect(holdsSinglePage(paged(0))).toBe(true);
  expect(holdsSinglePage(paged(1))).toBe(true);
  expect(holdsSinglePage(paged(2))).toBe(false);
  expect(holdsSinglePage([1, 2, 3])).toBe(true);
});

test("trimming keeps the first page of every list under the key and nothing else changes", () => {
  const client = new QueryClient();
  const own = ["collection-items", "server", "user", "netflix"];
  client.setQueryData([...own, true, "All"], paged(4), { updatedAt: 1_000 });
  client.setQueryData([...own, true, "Movie"], paged(1), { updatedAt: 2_000 });
  client.setQueryData(
    ["collection-items", "server", "user", "other"],
    paged(3),
    { updatedAt: 3_000 },
  );
  client.setQueryData(["collection", "server", "user", "netflix"], {
    Name: "Netflix",
  });

  trimToFirstPage(client, own);

  expect(client.getQueryData([...own, true, "All"])).toEqual(paged(1));
  expect(client.getQueryData([...own, true, "Movie"])).toEqual(paged(1));
  expect(
    client.getQueryData(["collection-items", "server", "user", "other"]),
  ).toEqual(paged(3));
  expect(
    client.getQueryData(["collection", "server", "user", "netflix"]),
  ).toEqual({ Name: "Netflix" });
});

test("trimming does not make an old list look fresh or clear its refresh mark", async () => {
  const client = new QueryClient();
  const key = ["collection-items", "server", "user", "netflix", true, "All"];
  client.setQueryData(key, paged(5), { updatedAt: 1_000 });
  await client.invalidateQueries({ queryKey: key });

  trimToFirstPage(client, key.slice(0, 4));

  const state = client.getQueryState(key);
  expect(state?.dataUpdatedAt).toBe(1_000);
  expect(state?.isInvalidated).toBe(true);
  expect(state?.status).toBe("success");
});
