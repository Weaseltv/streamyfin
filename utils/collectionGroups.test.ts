import { describe, expect, test } from "bun:test";
import {
  collectionGroup,
  GROUP_ORDER,
  groupTag,
  inGroupOrder,
  orderedGroups,
} from "./collectionGroups";

const box = (name: string, ...tags: string[]) => ({ Name: name, Tags: tags });

describe("Collections page groups, as on the TV", () => {
  test("a collection's group is its first named group tag", () => {
    expect(collectionGroup(box("A", "Other", groupTag("Studios")))).toBe(
      "Studios",
    );
    expect(
      collectionGroup(box("B", "WeaselPlex Group: ", groupTag("Sports"))),
    ).toBe("Sports");
    expect(collectionGroup(box("C", "WeaselPlex Streaming"))).toBeUndefined();
    expect(collectionGroup({ Tags: null })).toBeUndefined();
  });

  test("groups follow the owner's order, then others by name", () => {
    const items = [
      box("1", groupTag("Streaming Services")),
      box("2", groupTag("Zebra")),
      box("3", groupTag("New & Trending")),
      box("4", groupTag("Apple")),
      box("5", groupTag("Studios")),
      box("6"),
    ];
    expect(orderedGroups(items)).toEqual([
      "New & Trending",
      "Studios",
      "Streaming Services",
      "Apple",
      "Zebra",
    ]);
    expect(GROUP_ORDER).toHaveLength(12);
  });

  test("ALL lists group by group, names in order within a group, untagged last", () => {
    const items = [
      box("Alien", groupTag("Franchises & Universes")),
      box("Bond", groupTag("Franchises & Universes")),
      box("Loose"),
      box("Marvel Studios", groupTag("Studios")),
      box("Top 250", groupTag("Charts & Awards")),
    ];
    expect(inGroupOrder(items).map((item) => item.Name)).toEqual([
      "Top 250",
      "Marvel Studios",
      "Alien",
      "Bond",
      "Loose",
    ]);
  });
});
