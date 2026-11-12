import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { cancelItemPeopleWork } from "./cancelItemPeopleWork";

function pending(client: QueryClient, key: readonly unknown[]) {
  let aborted = false;
  const promise = client
    .fetchQuery({
      queryKey: key,
      queryFn: ({ signal }) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        }),
      retry: false,
    })
    .catch(() => undefined);
  return { promise, aborted: () => aborted };
}

test("blur cancels only this item's people and actor work in five repeated runs", async () => {
  for (let run = 0; run < 5; run++) {
    const client = new QueryClient();
    const ownPeople = pending(client, ["item", "current", "people"]);
    const ownActors = [1, 2, 3].map((id) =>
      pending(client, ["actor", "movies", id, "current", "user"]),
    );
    const metadata = pending(client, ["item", "current", ["MediaSources"]]);
    const otherPeople = pending(client, ["item", "other", "people"]);
    const otherActor = pending(client, [
      "actor",
      "movies",
      "actor",
      "other",
      "user",
    ]);
    await cancelItemPeopleWork(client, "current");
    expect(ownPeople.aborted()).toBe(true);
    for (const actor of ownActors) expect(actor.aborted()).toBe(true);
    expect(metadata.aborted()).toBe(false);
    expect(otherPeople.aborted()).toBe(false);
    expect(otherActor.aborted()).toBe(false);
    client.clear();
    await Promise.all([
      ownPeople.promise,
      ...ownActors.map((x) => x.promise),
      metadata.promise,
      otherPeople.promise,
      otherActor.promise,
    ]);
  }
});

test("cancellation retains cached people and ignores a missing item", async () => {
  const client = new QueryClient();
  const key = ["item", "current", "people"] as const;
  const people = [{ Id: "actor" }];
  client.setQueryData(key, people);
  const request = pending(client, key);
  await cancelItemPeopleWork(client, undefined);
  expect(request.aborted()).toBe(false);
  await cancelItemPeopleWork(client, "current");
  expect(request.aborted()).toBe(true);
  expect(client.getQueryData(key)).toBe(people);
  client.clear();
  await request.promise;
});
