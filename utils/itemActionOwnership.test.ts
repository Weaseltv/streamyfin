import { expect, test } from "bun:test";
import {
  admitItemAction,
  canExecuteItemAction,
  clearItemAction,
} from "./itemActionOwnership";

test("rapid presses keep one request, while a new account owns a new request", () => {
  const first = { ownerKey: "server:user", item: "a" };
  const next = { ownerKey: "server:user", item: "b" };
  expect(admitItemAction(first, next, first.ownerKey)).toBe(first);
  const other = { ownerKey: "server:other", item: "a" };
  expect(admitItemAction(first, other, other.ownerKey)).toBe(other);
});

test("logout, dismissal, replacement and repeated callbacks cannot execute old actions", () => {
  const request = { ownerKey: "server:user" };
  expect(canExecuteItemAction(request, request, request.ownerKey, null)).toBe(
    true,
  );
  expect(canExecuteItemAction(request, request, null, null)).toBe(false);
  expect(canExecuteItemAction(request, null, request.ownerKey, null)).toBe(
    false,
  );
  expect(
    canExecuteItemAction(request, { ...request }, request.ownerKey, null),
  ).toBe(false);
  expect(
    canExecuteItemAction(request, request, request.ownerKey, request),
  ).toBe(false);
});

test("old dismissal cannot clear a newer request", () => {
  const old = { ownerKey: "old" };
  const next = { ownerKey: "next" };
  expect(clearItemAction(old, old)).toBeNull();
  expect(clearItemAction(next, old)).toBe(next);
});
