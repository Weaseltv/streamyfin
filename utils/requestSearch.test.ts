import { afterEach, describe, expect, it } from "bun:test";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import axios, { type GenericAbortSignal } from "axios";
import type { Results } from "@/utils/jellyseerr/server/models/Search";
import {
  fetchRequestSearchPage,
  REQUEST_SEARCH_TIMEOUT_MS,
  type RequestSearchResults,
  requestSearchOptions,
  requestSearchResults,
} from "./requestSearch";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});

function server(fetch: (request: Request) => Response | Promise<Response>) {
  const instance = Bun.serve({ port: 0, fetch });
  cleanup.push(() => instance.stop(true));
  return axios.create({
    baseURL: instance.url.toString(),
    headers: { "X-Test-Session": "configured-client" },
  });
}

function cache() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 3, retryDelay: 1 } },
  });
  cleanup.push(() => client.clear());
  return client;
}

function result(id: number, mediaType = "movie") {
  return { id, mediaType, title: `Movie ${id}` } as Results;
}

function page(
  number = 1,
  totalPages = 1,
  results = [result(number)],
): RequestSearchResults {
  return { page: number, totalPages, totalResults: totalPages, results };
}

async function until(condition: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await Bun.sleep(10);
  }
  throw new Error("Search did not reach the expected state");
}

describe("request search transport and pagination", () => {
  it.each([
    " dragon ",
    "How to Train Your Dragon",
    "Fast & Furious + 100%",
    "Señor 日本語",
  ])(
    "sends the original title through the configured client: %s",
    async (title) => {
      const received: string[] = [];
      const client = server((request) => {
        const url = new URL(request.url);
        expect(url.pathname).toBe("/api/v1/search");
        expect(request.headers.get("X-Test-Session")).toBe("configured-client");
        received.push(url.searchParams.get("query")!);
        return Response.json(page());
      });
      await fetchRequestSearchPage(client, { query: title, page: 1 });
      expect(received).toEqual([title.trim()]);
    },
  );

  it("shows page one without requesting later pages, and keeps it during Load more", async () => {
    const received: number[] = [];
    const nextPage = Promise.withResolvers<void>();
    cleanup.push(() => nextPage.resolve());
    const client = server(async (request) => {
      const number = Number(new URL(request.url).searchParams.get("page"));
      received.push(number);
      if (number > 1) await nextPage.promise;
      return Response.json(page(number, 2));
    });
    const observer = new InfiniteQueryObserver(
      cache(),
      requestSearchOptions(client, "dragon", 1),
    );
    cleanup.push(observer.subscribe(() => {}));
    await until(() => observer.getCurrentResult().isSuccess);
    expect(received).toEqual([1]);
    expect(observer.getCurrentResult().hasNextPage).toBe(true);

    const more = observer.fetchNextPage();
    await until(() => received.length === 2);
    expect(observer.getCurrentResult().data?.pages).toEqual([page(1, 2)]);
    expect(observer.getCurrentResult().isLoading).toBe(false);
    nextPage.resolve();
    const completed = await more;
    expect(completed.data?.pages).toEqual([page(1, 2), page(2, 2)]);
    expect(completed.hasNextPage).toBe(false);
    await observer.fetchNextPage();
    expect(received).toEqual([1, 2]);
  });

  it("cancels an obsolete search and never replaces the new title's results", async () => {
    const slow = Promise.withResolvers<void>();
    cleanup.push(() => slow.resolve());
    const received: string[] = [];
    const signals: GenericAbortSignal[] = [];
    const client = server(async (request) => {
      const query = new URL(request.url).searchParams.get("query")!;
      received.push(query);
      if (query === "dra") await slow.promise;
      return Response.json(page(1, 1, [result(query === "dra" ? 1 : 2)]));
    });
    client.interceptors.request.use((config) => {
      signals.push(config.signal!);
      return config;
    });
    const observer = new InfiniteQueryObserver(
      cache(),
      requestSearchOptions(client, "dra", 1),
    );
    cleanup.push(observer.subscribe(() => {}));
    await until(() => received.length === 1);
    observer.setOptions(requestSearchOptions(client, "dragon", 1));
    await until(() => observer.getCurrentResult().isSuccess);
    expect(signals[0].aborted).toBe(true);
    slow.resolve();
    expect(observer.getCurrentResult().data?.pages[0].results).toEqual([
      result(2),
    ]);
    expect(received).toEqual(["dra", "dragon"]);
  });

  it("reuses a recent search and scopes cached availability to server and user", async () => {
    let requests = 0;
    const fetch = () => {
      requests++;
      return Response.json(page());
    };
    const client = server(fetch);
    const otherServer = server(fetch);
    const queryClient = cache();
    await queryClient.fetchInfiniteQuery(
      requestSearchOptions(client, "dragon", 1),
    );
    await queryClient.fetchInfiniteQuery(
      requestSearchOptions(client, " dragon ", 1),
    );
    expect(requests).toBe(1);
    await queryClient.fetchInfiniteQuery(
      requestSearchOptions(client, "dragon", 2),
    );
    await queryClient.fetchInfiniteQuery(
      requestSearchOptions(otherServer, "dragon", 1),
    );
    expect(requests).toBe(3);
    await queryClient.invalidateQueries({ queryKey: ["search", "jellyseerr"] });
    await queryClient.fetchInfiniteQuery(
      requestSearchOptions(client, "dragon", 1),
    );
    expect(requests).toBe(4);
  });

  it("surfaces a stalled server once, then supports an explicit retry", async () => {
    const slow = Promise.withResolvers<void>();
    cleanup.push(() => slow.resolve());
    let requests = 0;
    let configuredTimeout: number | undefined;
    const client = server(async () => {
      requests++;
      if (requests === 1) await slow.promise;
      return Response.json(page());
    });
    client.interceptors.request.use((config) => {
      configuredTimeout = config.timeout;
      config.timeout = 50; // Exercise real transport timeout without a 15s test.
      return config;
    });
    const observer = new InfiniteQueryObserver(
      cache(),
      requestSearchOptions(client, "dragon", 1),
    );
    cleanup.push(observer.subscribe(() => {}));
    await until(() => observer.getCurrentResult().isError);
    expect(configuredTimeout).toBe(REQUEST_SEARCH_TIMEOUT_MS);
    expect(requests).toBe(1);
    expect(observer.getCurrentResult().isFetching).toBe(false);
    const retried = await observer.refetch();
    expect(retried.isSuccess).toBe(true);
    expect(requests).toBe(2);
  });

  it("preserves successful pages if Load more fails, then retries the failed page", async () => {
    const received: number[] = [];
    const client = server((request) => {
      const number = Number(new URL(request.url).searchParams.get("page"));
      received.push(number);
      return received.length === 2
        ? new Response("unavailable", { status: 503 })
        : Response.json(page(number, 2));
    });
    const observer = new InfiniteQueryObserver(
      cache(),
      requestSearchOptions(client, "dragon", 1),
    );
    cleanup.push(observer.subscribe(() => {}));
    await until(() => observer.getCurrentResult().isSuccess);
    const failed = await observer.fetchNextPage();
    expect(failed.isFetchNextPageError).toBe(true);
    expect(failed.data?.pages).toEqual([page(1, 2)]);
    expect(failed.isLoading).toBe(false);
    const retried = await observer.fetchNextPage();
    expect(retried.isSuccess).toBe(true);
    expect(retried.data?.pages).toHaveLength(2);
    expect(received).toEqual([1, 2, 2]);
  });

  it("does not search an empty title or a disconnected server", async () => {
    let requests = 0;
    const client = server(() => {
      requests++;
      return Response.json(page());
    });
    const observer = new InfiniteQueryObserver(
      cache(),
      requestSearchOptions(client, "   ", 1),
    );
    cleanup.push(observer.subscribe(() => {}));
    expect(observer.getCurrentResult().isFetching).toBe(false);
    observer.setOptions(requestSearchOptions(undefined, "dragon", 1));
    expect(observer.getCurrentResult().isFetching).toBe(false);
    expect(requests).toBe(0);
  });

  it("deduplicates repeated pages without dropping movies and series sharing an ID", () => {
    const movie = result(1);
    const series = result(1, "tv");
    expect(
      requestSearchResults([page(1, 2, [movie]), page(2, 2, [movie, series])]),
    ).toEqual([movie, series]);
  });
});
