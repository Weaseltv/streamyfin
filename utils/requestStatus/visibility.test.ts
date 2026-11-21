import { describe, expect, test } from "bun:test";
import {
  isConfirmedAdult,
  isConfirmedKid,
  type LiveGateInput,
  liveGateOpen,
  normalizeJellyfinId,
  requestsTabVisible,
} from "./visibility";

const open: LiveGateInput = {
  requestsIndexFocused: true,
  searchText: "  ",
  keyboardOpen: false,
  sheetOpen: false,
  appActive: true,
  online: true,
  offlineMode: false,
  covered: false,
  transportProof: true,
};

describe("live gate", () => {
  test("open only while every condition holds", () => {
    expect(liveGateOpen(open)).toBe(true);
    const closers: Partial<LiveGateInput>[] = [
      { requestsIndexFocused: false },
      { searchText: "dune" },
      { keyboardOpen: true },
      { sheetOpen: true },
      { appActive: false },
      { online: false },
      { offlineMode: true },
      { covered: true },
      { transportProof: false },
    ];
    for (const c of closers)
      expect(liveGateOpen({ ...open, ...c })).toBe(false);
  });
});

const ID = "0123456789abcdef0123456789abcdef";
const DASHED = "01234567-89AB-CDEF-0123-456789ABCDEF";
const adult = { Id: ID, Policy: { MaxParentalRating: null } };
const kid = { Id: ID, Policy: { MaxParentalRating: 10 } };

describe("kid profiles (port of SeerrKidGuard)", () => {
  test("an adult only with that same user's policy and no rating ceiling", () => {
    expect(isConfirmedAdult(ID, adult)).toBe(true);
    expect(isConfirmedAdult(DASHED, adult)).toBe(true);
    expect(isConfirmedAdult(ID, { Id: ID, Policy: {} })).toBe(true);
    expect(isConfirmedAdult(ID, kid)).toBe(false);
    expect(isConfirmedAdult(ID, { Id: ID })).toBe(false);
    expect(isConfirmedAdult(ID, { ...adult, Id: "f".repeat(32) })).toBe(false);
    expect(isConfirmedAdult(null, adult)).toBe(false);
    expect(isConfirmedAdult(ID, null)).toBe(false);
  });

  test("a confirmed kid needs that same user's policy with a ceiling; unknown is not confirmed", () => {
    expect(isConfirmedKid(ID, kid)).toBe(true);
    expect(isConfirmedKid(ID, adult)).toBe(false);
    expect(
      isConfirmedKid(ID, {
        Id: "f".repeat(32),
        Policy: { MaxParentalRating: 10 },
      }),
    ).toBe(false);
    expect(isConfirmedKid(ID, null)).toBe(false);
  });

  test("ids normalize to lower case without dashes", () => {
    expect(normalizeJellyfinId(DASHED)).toBe(ID);
    expect(normalizeJellyfinId("nope")).toBeNull();
  });
});

describe("Requests tab", () => {
  const base = {
    isTV: false,
    userId: ID,
    confirmedUser: null,
    storedUser: adult,
  };

  test("phones, signed in, not a kid: shown", () => {
    expect(requestsTabVisible(base)).toBe(true);
  });

  test("never on TV builds, never signed out", () => {
    expect(requestsTabVisible({ ...base, isTV: true })).toBe(false);
    expect(requestsTabVisible({ ...base, userId: null })).toBe(false);
  });

  test("the stored policy decides until this session's is confirmed; none counts as a kid", () => {
    expect(requestsTabVisible({ ...base, storedUser: null })).toBe(false);
    expect(requestsTabVisible({ ...base, storedUser: kid })).toBe(false);
  });

  test("a confirmed policy takes precedence either way", () => {
    expect(requestsTabVisible({ ...base, confirmedUser: kid })).toBe(false);
    expect(
      requestsTabVisible({ ...base, storedUser: kid, confirmedUser: adult }),
    ).toBe(true);
    expect(
      requestsTabVisible({
        ...base,
        confirmedUser: { ...adult, Id: "f".repeat(32) },
      }),
    ).toBe(false);
  });
});
