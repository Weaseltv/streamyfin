import { describe, expect, test } from "bun:test";
import {
  accountKey,
  decideIdentity,
  isPinnedOrigin,
  journalKey,
  normalizeOrigin,
  PINNED_REQUEST_ORIGIN,
} from "./session";

const VIEWER = "0123456789abcdef0123456789abcdef";
const OTHER = "ffffffffffffffffffffffffffffffff";
const CUSTOM = "https://seerr.example.com";

describe("origins and keys", () => {
  test("origins drop slashes and /api/v1; the pinned server is the empty or pinned URL", () => {
    expect(normalizeOrigin("HTTPS://Requests.TheWeasel.tv/api/v1/")).toBe(
      PINNED_REQUEST_ORIGIN,
    );
    expect(isPinnedOrigin(undefined)).toBe(true);
    expect(isPinnedOrigin("")).toBe(true);
    expect(isPinnedOrigin("https://requests.theweasel.tv/")).toBe(true);
    expect(isPinnedOrigin(CUSTOM)).toBe(false);
  });

  test("journal keys match the TV's format", () => {
    expect(journalKey(PINNED_REQUEST_ORIGIN, 7)).toBe(
      "request_notifications_weaselplex|7",
    );
    expect(journalKey(undefined, 7)).toBe("request_notifications_weaselplex|7");
    expect(journalKey(`${CUSTOM}/`, 7)).toBe(
      `request_notifications_${CUSTOM}|7`,
    );
  });

  test("the account is the media-server user plus the origin, not the Seerr user", () => {
    expect(accountKey("01234567-89AB-CDEF-0123-456789ABCDEF", undefined)).toBe(
      `${VIEWER}|${PINNED_REQUEST_ORIGIN}`,
    );
    expect(accountKey(VIEWER, CUSTOM)).toBe(`${VIEWER}|${CUSTOM}`);
    expect(accountKey(null, CUSTOM)).toBeNull();
  });
});

describe("rule 3: whose session this is", () => {
  const pinned = {
    url: PINNED_REQUEST_ORIGIN,
    jellyfinUserId: VIEWER,
    storedSeerrUserId: 7,
    binding: null,
  };

  test("pinned server: same Seerr user and same media-server user", () => {
    expect(
      decideIdentity({ ...pinned, me: { id: 7, jellyfinUserId: VIEWER } }).kind,
    ).toBe("pinned");
    expect(
      decideIdentity({
        ...pinned,
        me: { id: 7, jellyfinUserId: "01234567-89ab-cdef-0123-456789abcdef" },
      }).kind,
    ).toBe("pinned");
  });

  test("pinned server: an empty Jellyfin id never qualifies; another person or Seerr user is a mismatch", () => {
    expect(
      decideIdentity({ ...pinned, me: { id: 7, jellyfinUserId: "" } }).kind,
    ).toBe("mismatch");
    expect(
      decideIdentity({ ...pinned, me: { id: 7, jellyfinUserId: null } }).kind,
    ).toBe("mismatch");
    expect(
      decideIdentity({ ...pinned, me: { id: 7, jellyfinUserId: OTHER } }).kind,
    ).toBe("mismatch");
    expect(
      decideIdentity({ ...pinned, me: { id: 8, jellyfinUserId: VIEWER } }).kind,
    ).toBe("mismatch");
    expect(decideIdentity({ ...pinned, me: null }).kind).toBe("mismatch");
    expect(
      decideIdentity({
        ...pinned,
        jellyfinUserId: null,
        me: { id: 7, jellyfinUserId: VIEWER },
      }).kind,
    ).toBe("mismatch");
  });

  test("another server: matching Jellyfin id, or an empty one with this viewer's binding", () => {
    const other = { ...pinned, url: CUSTOM };
    expect(
      decideIdentity({ ...other, me: { id: 7, jellyfinUserId: VIEWER } }).kind,
    ).toBe("other");
    expect(
      decideIdentity({ ...other, me: { id: 7, jellyfinUserId: OTHER } }).kind,
    ).toBe("mismatch");
    expect(
      decideIdentity({ ...other, me: { id: 7, jellyfinUserId: "" } }).kind,
    ).toBe("mismatch");
    const binding = {
      jellyfinUserId: VIEWER,
      origin: `${CUSTOM}/`,
      seerrUserId: 7,
    };
    expect(decideIdentity({ ...other, binding, me: { id: 7 } }).kind).toBe(
      "other",
    );
    expect(
      decideIdentity({
        ...other,
        binding: { ...binding, jellyfinUserId: OTHER },
        me: { id: 7 },
      }).kind,
    ).toBe("mismatch");
    expect(
      decideIdentity({
        ...other,
        binding: { ...binding, origin: "https://x.example" },
        me: { id: 7 },
      }).kind,
    ).toBe("mismatch");
    expect(
      decideIdentity({
        ...other,
        binding: { ...binding, seerrUserId: 9 },
        me: { id: 7 },
      }).kind,
    ).toBe("mismatch");
  });
});
