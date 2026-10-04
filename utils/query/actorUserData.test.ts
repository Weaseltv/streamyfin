import { describe, expect, test } from "bun:test";
import { patchActorUserData } from "./actorUserData";

const first = { Id: "a", UserData: { Played: false, IsFavorite: true } };
const second = { Id: "b", UserData: { Played: false } };
const items = [first, second];
describe("actor catalog user data", () => {
  test("updates the matching card and retains other fields and identities", () => {
    const next = patchActorUserData(items, [
      { ItemId: "a", Played: true },
    ]) as typeof items;
    expect(next).not.toBe(items);
    expect(next[0]).toEqual({
      ...first,
      UserData: { Played: true, IsFavorite: true },
    });
    expect(next[1]).toBe(second);
    expect(first.UserData.Played).toBe(false);
  });
  test("no-op and unrelated messages preserve the cached array", () => {
    expect(patchActorUserData(items, [{ ItemId: "a", Played: false }])).toBe(
      items,
    );
    expect(patchActorUserData(items, [{ ItemId: "other", Played: true }])).toBe(
      items,
    );
  });
  test("ignores missing and malformed data", () => {
    expect(patchActorUserData(items, [null, {}, "wrong"])).toBe(items);
    expect(patchActorUserData(items, undefined)).toBe(items);
    expect(patchActorUserData(undefined, [])).toBeUndefined();
  });
});
