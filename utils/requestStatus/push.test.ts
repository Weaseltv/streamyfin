import { describe, expect, test } from "bun:test";
import fixture from "../../docs/request-notifications/request-stages.fixture.json";
import {
  isRequestKind,
  parseRequestPush,
  pushIsForViewer,
} from "./pushPayload";
import {
  afterRegister,
  afterUnregister,
  DAILY_REFRESH_MS,
  decodePushState,
  emptyPushState,
  newAppSession,
  nextAction,
  type PushInputs,
  wantedRegistration,
} from "./pushRegistration";
import { deriveRequestStage, eventKey } from "./stage";
import type { OwnRequest } from "./types";

const USER = "0123456789abcdef0123456789abcdef";
const data = (over: Record<string, unknown> = {}) => ({
  v: 1,
  kind: "request",
  event: "ready",
  eventKey: "v1|10|hd|ready|-",
  requestId: 10,
  tmdbId: 500,
  mediaType: "movie",
  is4k: false,
  recipientJellyfinUserId: USER,
  url: "/(auth)/(tabs)/(search)?requestTab=my&requestId=10",
  ...over,
});

describe("request notification data", () => {
  test("a valid payload parses; its key equals the TV's key for the same request", () => {
    const push = parseRequestPush(data());
    expect(push).toMatchObject({
      requestId: 10,
      event: "ready",
      recipient: USER,
      eventKey: "v1|10|hd|ready|-",
    });
    const ready = fixture.cases.find((c) => c.name === "movie_ready")
      ?.request as unknown as OwnRequest;
    expect(eventKey(ready, deriveRequestStage(ready))).toBe("v1|10|hd|ready|-");
    expect(
      parseRequestPush(
        data({ event: "failed", eventKey: "v1|10|4k|failed|-", is4k: true }),
      )?.is4k,
    ).toBe(true);
  });

  test("anything off is refused, but still recognised as a request notification", () => {
    const bad = [
      { v: 2 },
      { requestId: 0 },
      { requestId: "10" },
      { tmdbId: 1.5 },
      { mediaType: "person" },
      { is4k: "false" },
      { event: "partial" },
      { recipientJellyfinUserId: "someone" },
      { eventKey: "v1|10|4k|ready|-" },
      { eventKey: "v1|10|hd|ready|1:A" },
    ];
    for (const over of bad) {
      expect(parseRequestPush(data(over))).toBeNull();
      expect(isRequestKind(data(over))).toBe(true);
    }
    expect(isRequestKind({ type: "movie", id: "x" })).toBe(false);
  });

  test("the recipient is compared in the website's form", () => {
    const push = parseRequestPush(
      data({ recipientJellyfinUserId: "01234567-89AB-CDEF-0123-456789ABCDEF" }),
    );
    expect(push && pushIsForViewer(push, USER)).toBe(true);
    expect(push && pushIsForViewer(push, "f".repeat(32))).toBe(false);
    expect(push && pushIsForViewer(push, null)).toBe(false);
  });
});

const inputs: PushInputs = {
  weaselPlexServer: true,
  adult: true,
  pinned: true,
  permission: true,
  switchOn: true,
  expoToken: "ExponentPushToken[abcdefghij]",
  deviceId: "device-1",
  jellyfinUserId: "01234567-89ab-cdef-0123-456789abcdef",
};
const T0 = 1_800_000_000_000;
const S = "session-1";

describe("registration", () => {
  test("wanted only for the WeaselPlex server, an adult, the pinned request server, permission and the switch", () => {
    expect(wantedRegistration(inputs)).toEqual({
      expoToken: inputs.expoToken,
      deviceId: "device-1",
      jellyfinUserId: USER,
    });
    for (const k of [
      "weaselPlexServer",
      "adult",
      "pinned",
      "permission",
      "switchOn",
    ] as const) {
      expect(wantedRegistration({ ...inputs, [k]: false })).toBeNull();
    }
    expect(wantedRegistration({ ...inputs, expoToken: null })).toBeNull();
  });

  test("registers, then not again until a day passed", () => {
    const want = wantedRegistration(inputs);
    let s = emptyPushState();
    expect(nextAction(s, want, T0, S, false).kind).toBe("register");
    s = afterRegister(s, want!, 204, T0, S);
    expect(nextAction(s, want, T0 + 1000, S, true).kind).toBe("none");
    expect(nextAction(s, want, T0 + DAILY_REFRESH_MS, S, true).kind).toBe(
      "register",
    );
    // A rotated token registers at once.
    expect(
      nextAction(
        s,
        { ...want!, expoToken: "ExponentPushToken[zzzzzzzzzz]" },
        T0 + 1,
        S,
        false,
      ).kind,
    ).toBe("register");
  });

  test("401 and 409 stop for this sign-in; 404/503 wait for the next app session; 429 waits", () => {
    const want = wantedRegistration(inputs)!;
    let s = afterRegister(emptyPushState(), want, 409, T0, S);
    expect(nextAction(s, want, T0 + DAILY_REFRESH_MS * 2, S, true).kind).toBe(
      "none",
    );
    expect(nextAction(s, want, T0, "session-2", false).kind).toBe("register");
    s = afterRegister(emptyPushState(), want, 404, T0, S);
    expect(nextAction(s, want, T0 + 10 ** 9, S, true).kind).toBe("none");
    expect(nextAction(newAppSession(s), want, T0, S, false).kind).toBe(
      "register",
    );
    s = afterRegister(emptyPushState(), want, 429, T0, S, 5_000);
    expect(nextAction(s, want, T0 + 59_000, S, false).kind).toBe("none");
    expect(nextAction(s, want, T0 + 60_000, S, false).kind).toBe("register");
  });

  test("when no longer wanted, every confirmed and uncertain registration is removed", () => {
    const want = wantedRegistration(inputs)!;
    const rotated = { ...want, expoToken: "ExponentPushToken[zzzzzzzzzz]" };
    let s = afterRegister(emptyPushState(), want, 204, T0, S);
    s = afterRegister(s, rotated, null, T0 + 1, S);
    const action = nextAction(s, null, T0 + 2, S, false);
    expect(action).toEqual({ kind: "unregister", targets: [want, rotated] });
    s = afterUnregister(s, want, 204, T0 + 3);
    s = afterUnregister(s, rotated, 204, T0 + 3);
    expect(nextAction(s, null, T0 + 4, S, false).kind).toBe("none");
  });

  test("an uncertain teardown of the same registration forces a new one on the next return", () => {
    const want = wantedRegistration(inputs)!;
    let s = afterRegister(emptyPushState(), want, 204, T0, S);
    s = afterUnregister(s, want, null, T0 + 1);
    expect(s.forceNext).toBe(true);
    expect(nextAction(s, want, T0 + 2, S, true).kind).toBe("register");
    s = afterRegister(s, want, 204, T0 + 3, S);
    expect(s.uncertain).toEqual([]);
    expect(s.forceNext).toBe(false);
  });

  test("stored state survives a restart; throttles do not", () => {
    const want = wantedRegistration(inputs)!;
    const s = afterRegister(emptyPushState(), want, 204, T0, S);
    const back = decodePushState(
      JSON.parse(JSON.stringify({ ...s, finalFor: S, retryAt: 5 })),
    );
    expect(back.confirmed).toEqual({ ...want, at: T0 });
    expect(back.finalFor).toBeNull();
    expect(decodePushState("x")).toEqual(emptyPushState());
  });
});
