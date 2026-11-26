import { beforeEach, describe, expect, test } from "bun:test";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  AddKidController,
  backoffMillis,
  errorFor,
  formatPairingCode,
  isKidUser,
  type KidSignIn,
  normalisedUserId,
  type QuickConnectPoll,
} from "./addKidController";
import type {
  KidApiResult,
  KidLevel,
  KidList,
  KidProfile,
  KidProfilesClient,
} from "./kidProfilesApi";

// Port of the TV's AddKidViewModelTest from the "create or add an existing kid" step on (the
// grown-up's PIN and the other grown-ups' PINs are the caller's on phones).

const testKid = (name: string): KidProfile => ({
  id: `kid-${name}`,
  displayName: name,
  level: "kids",
  state: "active",
  mediaUserId: null,
  mediaUserName: null,
});
const ownKid = (name: string): KidProfile => ({
  ...testKid(name),
  mediaUserId: `0000000000000000000000000000${name.length.toString().padStart(4, "0")}`,
});

class FakeKids implements KidProfilesClient {
  listResults: KidApiResult<KidList>[] = [];
  createResults: KidApiResult<KidProfile>[] = [];
  connectResults: KidApiResult<KidProfile>[] = [];
  listCalls: string[] = [];
  createCalls: { token: string; key: string; name: string; level: KidLevel }[] =
    [];
  connectCalls: [string, string, string][] = [];

  async list(token: string) {
    this.listCalls.push(token);
    return (
      this.listResults.shift() ?? {
        kind: "ok" as const,
        value: { kids: [], limit: 5 },
      }
    );
  }
  async create(token: string, key: string, name: string, level: KidLevel) {
    this.createCalls.push({ token, key, name, level });
    return (
      this.createResults.shift() ?? {
        kind: "ok" as const,
        value: testKid(name),
      }
    );
  }
  async connect(token: string, kidId: string, code: string) {
    this.connectCalls.push([token, kidId, code]);
    const kid = testKid(kidId.replace(/^kid-/, ""));
    return this.connectResults.shift() ?? { kind: "ok" as const, value: kid };
  }
}

class FakeQuickConnect {
  initiated = 0;
  authenticated = 0;
  polled: string[] = [];
  signedOut: string[] = [];
  pollResults: (QuickConnectPoll | Error)[] = [];
  pollsUntilAuthenticated = 0;
  authRating: number | null = 10;
  authPolicy = true;
  authGate: Promise<void> | null = null;
  onPoll: () => void = () => {};

  async initiate() {
    this.initiated++;
    const n = this.initiated;
    return {
      code: n.toString().padStart(6, "0"),
      secret: `secret-${n}`,
    };
  }
  async isAuthenticated(secret: string) {
    this.polled.push(secret);
    this.onPoll();
    return this.polled.length > this.pollsUntilAuthenticated;
  }
  async poll(secret: string): Promise<QuickConnectPoll> {
    this.polled.push(secret);
    this.onPoll();
    const next = this.pollResults.shift();
    if (next instanceof Error) throw next;
    if (next) return next;
    return this.polled.length > this.pollsUntilAuthenticated
      ? "authenticated"
      : "waiting";
  }
  async authenticate(): Promise<KidSignIn> {
    this.authenticated++;
    if (this.authGate) await this.authGate;
    const user: UserDto = {
      Id: "kid-user-id",
      Name: "Emma",
      Policy: this.authPolicy
        ? ({
            MaxParentalRating: this.authRating,
          } as UserDto["Policy"])
        : undefined,
    };
    return { accessToken: "kid-token", user };
  }
  async signOut(token: string) {
    this.signedOut.push(token);
  }
}

let kids: FakeKids;
let qc: FakeQuickConnect;
let handed: { accessToken: string; user: UserDto; displayName?: string }[];
let onKidFailure: Error | null;
let pictures: [string, string][];
let pictureFailure: Error | null;
let sleeps: number[];
let keys: number;
let controller: AddKidController;

function makeController(hasAvatars = true, savedUserIds: string[] = []) {
  return new AddKidController({
    parentToken: "token-Mom",
    kids,
    quickConnect: qc,
    onKid: async (profile) => {
      if (onKidFailure) throw onKidFailure;
      handed.push(profile);
    },
    savePicture: async (kid, avatarId) => {
      if (pictureFailure) throw pictureFailure;
      pictures.push([kid.accessToken, avatarId]);
    },
    hasAvatars,
    savedUserIds: () => savedUserIds,
    newKey: () => `key-${String(++keys).padStart(16, "0")}`,
    sleep: async (ms, signal) => {
      if (signal.aborted) throw new Error("aborted");
      sleeps.push(ms);
      await Promise.resolve();
      if (signal.aborted) throw new Error("aborted");
    },
  });
}

beforeEach(() => {
  kids = new FakeKids();
  qc = new FakeQuickConnect();
  handed = [];
  onKidFailure = null;
  pictures = [];
  pictureFailure = null;
  sleeps = [];
  keys = 0;
  controller = makeController();
});

const step = () => controller.getStep();

function fillForm(name = "Emma", level: KidLevel | null = "kids") {
  controller.createNew();
  controller.updateForm({ name, level });
  return controller.submitForm();
}

function expectSignedIn(displayName: string) {
  expect(step()).toEqual({ kind: "done" });
  expect(handed).toHaveLength(1);
  expect(handed[0].displayName).toBe(displayName);
  expect(handed[0].accessToken).toBe("kid-token");
}

describe("add kid flow", () => {
  test("starts by offering to create or add an existing kid", () => {
    expect(step()).toEqual({ kind: "chooseHow" });
  });

  test("existing kid signs in on this phone without creating", async () => {
    const emma = testKid("Emma");
    kids.connectResults.push({
      kind: "ok",
      value: { ...emma, displayName: "Emma B" },
    });
    await controller.signInExisting(emma);
    expect(kids.createCalls).toHaveLength(0);
    expect(kids.connectCalls).toEqual([["token-Mom", "kid-Emma", "000001"]]);
    expectSignedIn("Emma B");
  });

  test("form checks the name and level before sending", () => {
    fillForm("  ", "kids");
    expect((step() as { nameError?: string }).nameError).toBe("invalid");
    controller.updateForm({ name: "Emma", level: null });
    controller.submitForm();
    expect((step() as { error?: { kind: string } }).error?.kind).toBe(
      "pickLevel",
    );
    controller.updateForm({
      name: "A name that is far too long",
      level: "teens",
    });
    controller.submitForm();
    expect((step() as { nameError?: string }).nameError).toBe("invalid");
    expect(kids.createCalls).toHaveLength(0);
  });

  test("new kid is created, connected, signed in and gets the picked picture", async () => {
    fillForm("  Emma  ", "older_kids");
    expect(step()).toEqual({
      kind: "pickPicture",
      name: "Emma",
      level: "older_kids",
      selected: null,
    });
    await controller.pickPicture("bee-blue");
    const create = kids.createCalls[0];
    expect(kids.createCalls).toHaveLength(1);
    expect(create.token).toBe("token-Mom");
    expect(create.name).toBe("Emma");
    expect(create.level).toBe("older_kids");
    expect(create.key.length).toBeGreaterThanOrEqual(16);
    expect(kids.connectCalls[0][1]).toBe("kid-Emma");
    expectSignedIn("Emma");
    expect(pictures).toEqual([["kid-token", "bee-blue"]]);
  });

  test("skipping the picture saves none", async () => {
    fillForm();
    await controller.pickPicture(null);
    expectSignedIn("Emma");
    expect(pictures).toHaveLength(0);
  });

  test("no pictures bundled skips the picture step", async () => {
    controller = makeController(false);
    await fillForm();
    expectSignedIn("Emma");
  });

  test("a failed picture save still signs the kid in", async () => {
    pictureFailure = new Error("403");
    fillForm();
    await controller.pickPicture("bee-blue");
    expectSignedIn("Emma");
  });

  test("create retry reuses the idempotency key", async () => {
    kids.createResults.push({ kind: "network", cause: new Error("offline") });
    fillForm();
    await controller.pickPicture(null);
    expect(step()).toEqual({
      kind: "failed",
      error: { kind: "network" },
      retry: { kind: "create", name: "Emma", level: "kids" },
    });
    await controller.retry();
    expect(kids.createCalls).toHaveLength(2);
    expect(kids.createCalls[0].key).toBe(kids.createCalls[1].key);
    expectSignedIn("Emma");
  });

  test("request in progress waits and retries the same key", async () => {
    kids.createResults.push({
      kind: "problem",
      status: 409,
      code: "REQUEST_IN_PROGRESS",
    });
    fillForm();
    await controller.pickPicture(null);
    expect(kids.createCalls).toHaveLength(2);
    expect(kids.createCalls[0].key).toBe(kids.createCalls[1].key);
    expect(sleeps).toContain(2_000);
    expectSignedIn("Emma");
  });

  test("idempotency conflict gets a new key next time", async () => {
    kids.createResults.push({
      kind: "problem",
      status: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
    fillForm();
    await controller.pickPicture(null);
    expect(step()).toMatchObject({
      kind: "failed",
      error: { kind: "generic" },
    });
    await controller.retry();
    expect(kids.createCalls[0].key).not.toBe(kids.createCalls[1].key);
  });

  test("a changed form is a new submission with a new key", async () => {
    kids.createResults.push({
      kind: "problem",
      status: 409,
      code: "KID_NAME_TAKEN",
    });
    fillForm();
    await controller.pickPicture(null);
    expect((step() as { nameError?: string }).nameError).toBe("taken");
    controller.updateForm({ name: "Emma 2" });
    controller.submitForm();
    await controller.pickPicture(null);
    expect(kids.createCalls[0].key).not.toBe(kids.createCalls[1].key);
    expect(kids.createCalls[1].name).toBe("Emma 2");
  });

  test("invalid request from the website is an inline name error", async () => {
    kids.createResults.push({
      kind: "problem",
      status: 400,
      code: "INVALID_REQUEST",
    });
    fillForm();
    await controller.pickPicture(null);
    expect((step() as { nameError?: string }).nameError).toBe("invalid");
  });

  test("connect failure after create reconnects the same kid and never creates again", async () => {
    kids.connectResults.push({ kind: "network", cause: new Error("offline") });
    fillForm();
    await controller.pickPicture(null);
    expect(step()).toEqual({
      kind: "failed",
      error: { kind: "network" },
      retry: { kind: "connect", kid: testKid("Emma") },
    });
    await controller.retry();
    expect(kids.createCalls).toHaveLength(1);
    expect(kids.connectCalls.map((c) => c[1])).toEqual([
      "kid-Emma",
      "kid-Emma",
    ]);
    expectSignedIn("Emma");
  });

  test("expired code gets a fresh code for the same kid once", async () => {
    kids.connectResults.push({
      kind: "problem",
      status: 400,
      code: "QUICK_CONNECT_INVALID_CODE",
    });
    fillForm();
    await controller.pickPicture(null);
    expect(qc.initiated).toBe(2);
    expect(kids.connectCalls.map((c) => c[2])).toEqual(["000001", "000002"]);
    expect(kids.createCalls).toHaveLength(1);
    expectSignedIn("Emma");
  });

  test("a second invalid code stops with a retry for the same kid", async () => {
    for (let i = 0; i < 2; i++)
      kids.connectResults.push({
        kind: "problem",
        status: 400,
        code: "QUICK_CONNECT_INVALID_CODE",
      });
    fillForm();
    await controller.pickPicture(null);
    expect(step()).toEqual({
      kind: "failed",
      error: { kind: "generic" },
      retry: { kind: "connect", kid: testKid("Emma") },
    });
  });

  test("quick connect that never authenticates times out to a retry", async () => {
    qc.pollsUntilAuthenticated = Number.MAX_SAFE_INTEGER;
    fillForm();
    await controller.pickPicture(null);
    expect(qc.initiated).toBe(2);
    expect(qc.polled).toHaveLength(60);
    expect(step().kind).toBe("failed");
    expect(handed).toHaveLength(0);
  });

  test("kid not found on connect refreshes the list", async () => {
    const emma = ownKid("Emma");
    kids.listResults.push({ kind: "ok", value: { kids: [emma], limit: 5 } });
    kids.listResults.push({ kind: "ok", value: { kids: [], limit: 5 } });
    kids.connectResults.push({
      kind: "problem",
      status: 404,
      code: "KID_NOT_FOUND",
    });
    qc.pollsUntilAuthenticated = Number.MAX_SAFE_INTEGER;
    let polls = 0;
    qc.onPoll = () => {
      if (++polls === 1) {
        expect((step() as { kids?: KidProfile[] }).kids).toEqual([emma]);
        void controller.signInExisting(emma);
      } else if (polls === 3) controller.cancel();
    };
    const first = controller.addExisting();
    await first;
    // The second pairing screen loaded the list again.
    await new Promise((r) => setTimeout(r, 0));
    expect(kids.listCalls).toHaveLength(2);
    expect(step()).toMatchObject({ kind: "pairing", kids: [] });
  });

  test("contract errors map to what the phone shows", () => {
    const map = (code: string, retryAfterMillis?: number) =>
      errorFor({ kind: "problem", status: 400, code, retryAfterMillis });
    expect(map("WEASELPLEX_KIDS_UNAVAILABLE")).toEqual({
      kind: "notAvailable",
    });
    expect(map("KID_LIMIT_REACHED")).toEqual({ kind: "limitReached" });
    expect(map("WEASELPLEX_ACCESS_REQUIRED")).toEqual({
      kind: "accessInactive",
    });
    expect(map("AUTHENTICATION_REQUIRED")).toEqual({ kind: "signInAgain" });
    expect(map("KID_NOT_ACTIVE")).toEqual({ kind: "kidNotActive" });
    expect(map("RATE_LIMITED", 90_000)).toEqual({
      kind: "rateLimited",
      minutes: 2,
    });
    expect(map("RATE_LIMITED")).toEqual({ kind: "rateLimited", minutes: null });
    expect(map("KID_CALLER_FORBIDDEN")).toEqual({ kind: "generic" });
    expect(map("WEASELPLEX_UNAVAILABLE")).toEqual({ kind: "generic" });
  });

  test("flag off on create shows unavailable with a retry", async () => {
    kids.createResults.push({
      kind: "problem",
      status: 404,
      code: "WEASELPLEX_KIDS_UNAVAILABLE",
    });
    fillForm();
    await controller.pickPicture(null);
    expect(step()).toEqual({
      kind: "failed",
      error: { kind: "notAvailable" },
      retry: { kind: "create", name: "Emma", level: "kids" },
    });
  });

  test("a sign-in handed over that then fails is never signed out and retries with a new code", async () => {
    onKidFailure = new Error("storage");
    await controller.signInExisting(testKid("Emma"));
    expect(step()).toMatchObject({
      kind: "failed",
      retry: { kind: "connect" },
    });
    expect(qc.signedOut).toHaveLength(0);
    onKidFailure = null;
    await controller.retry();
    expect(qc.initiated).toBe(2);
    expectSignedIn("Emma");
  });
});

describe("pairing a kid with a code (contract 12.3)", () => {
  test("shows the code and the account's own kids not on this phone yet", async () => {
    const emma = ownKid("Emma");
    const avery = { ...ownKid("Avery"), id: "kid-Avery" };
    const disabled = { ...ownKid("Zed"), state: "disabled" };
    controller = makeController(true, [
      // Saved with dashes and upper case: still the same user.
      `${avery.mediaUserId?.toUpperCase().slice(0, 8)}-${avery.mediaUserId?.toUpperCase().slice(8)}`,
    ]);
    kids.listResults.push({
      kind: "ok",
      value: { kids: [emma, avery, disabled], limit: 5 },
    });
    qc.pollsUntilAuthenticated = Number.MAX_SAFE_INTEGER;
    let seen: unknown = null;
    qc.onPoll = () => {
      if (qc.polled.length === 2) {
        seen = step();
        controller.cancel();
      }
    };
    await controller.addExisting();
    expect(seen).toEqual({
      kind: "pairing",
      code: "000001",
      kids: [emma],
      trouble: false,
    });
    expect(kids.listCalls).toEqual(["token-Mom"]);
    expect(formatPairingCode("000001")).toBe("000 001");
    // Polled every 2 seconds, and polling stops when the screen is left.
    expect(sleeps).toEqual([2_000, 2_000]);
    expect(qc.polled).toHaveLength(2);
  });

  test("an expired pairing code is replaced by a new one by itself", async () => {
    qc.pollResults.push("waiting", "expired");
    qc.pollsUntilAuthenticated = Number.MAX_SAFE_INTEGER;
    qc.onPoll = () => {
      if (qc.polled.length === 3) controller.cancel();
    };
    await controller.addExisting();
    expect(qc.initiated).toBe(2);
    expect(step()).toMatchObject({ kind: "pairing", code: "000002" });
    expect(qc.polled).toEqual(["secret-1", "secret-1", "secret-2"]);
  });

  test("failed polls back off and keep the code", async () => {
    qc.pollResults.push(new Error("offline"), new Error("offline"));
    qc.pollsUntilAuthenticated = Number.MAX_SAFE_INTEGER;
    const trouble: boolean[] = [];
    qc.onPoll = () => {
      trouble.push((step() as { trouble: boolean }).trouble);
      if (qc.polled.length === 4) controller.cancel();
    };
    await controller.addExisting();
    // 2 s, then 4 s and 8 s after failures, then back to 2 s.
    expect(sleeps).toEqual([2_000, 4_000, 8_000, 2_000]);
    expect(trouble).toEqual([false, true, true, false]);
    expect(step()).toMatchObject({ kind: "pairing", code: "000001" });
    expect(qc.initiated).toBe(1);
  });

  test("a code approved for a grown-up is refused and signed out", async () => {
    qc.authRating = null;
    await controller.addExisting();
    expect(step()).toEqual({ kind: "pairingRefused" });
    expect(qc.signedOut).toEqual(["kid-token"]);
    expect(handed).toHaveLength(0);
    // "Get a new code", approved for the kid this time.
    qc.authRating = 10;
    await controller.addExisting();
    expect(qc.initiated).toBe(2);
    expectSignedIn("Emma");
  });

  test("a sign-in without a policy is refused like a grown-up's", async () => {
    qc.authPolicy = false;
    await controller.addExisting();
    expect(step()).toEqual({ kind: "pairingRefused" });
    expect(qc.signedOut).toEqual(["kid-token"]);
    expect(handed).toHaveLength(0);
  });

  test("a paired kid is handed over with its server name and no picture step", async () => {
    await controller.addExisting();
    expectSignedIn("Emma");
    expect(kids.createCalls).toHaveLength(0);
    expect(kids.connectCalls).toHaveLength(0);
    expect(pictures).toHaveLength(0);
    // Handed over: closing the flow afterwards never signs it out.
    controller.cancel();
    expect(qc.signedOut).toHaveLength(0);
  });

  test("a paired sign-in that fails when handed over is kept for a retry, never signed out", async () => {
    onKidFailure = new Error("storage");
    await controller.addExisting();
    expect(step()).toMatchObject({ kind: "failed", retry: { kind: "pair" } });
    onKidFailure = null;
    await controller.retry();
    expectSignedIn("Emma");
    expect(qc.authenticated).toBe(1);
    expect(qc.signedOut).toHaveLength(0);
  });

  test("backing out while a kid's sign-in arrives signs that token out", async () => {
    let release: () => void = () => {};
    qc.authGate = new Promise((r) => {
      release = r;
    });
    const running = controller.addExisting();
    await new Promise((r) => setTimeout(r, 0));
    expect(qc.authenticated).toBe(1);
    controller.cancel();
    release();
    await running;
    expect(qc.signedOut).toEqual(["kid-token"]);
    expect(handed).toHaveLength(0);
  });

  test("backing out while a grown-up's sign-in arrives signs that token out", async () => {
    qc.authRating = null;
    let release: () => void = () => {};
    qc.authGate = new Promise((r) => {
      release = r;
    });
    const running = controller.addExisting();
    await new Promise((r) => setTimeout(r, 0));
    controller.cancel();
    release();
    await running;
    expect(qc.signedOut).toEqual(["kid-token"]);
    expect(handed).toHaveLength(0);
  });

  test("back from pairing stops polling and returns to the choice", async () => {
    qc.pollsUntilAuthenticated = Number.MAX_SAFE_INTEGER;
    qc.onPoll = () => {
      if (qc.polled.length === 1) controller.back();
    };
    await controller.addExisting();
    expect(step()).toEqual({ kind: "chooseHow" });
    expect(qc.polled).toHaveLength(1);
  });
});

describe("rules", () => {
  test("kid signal, backoff and id rules", () => {
    expect(isKidUser({ Policy: { MaxParentalRating: 10 } } as UserDto)).toBe(
      true,
    );
    expect(isKidUser({ Policy: { MaxParentalRating: null } } as UserDto)).toBe(
      false,
    );
    expect(isKidUser({} as UserDto)).toBe(false);
    expect([1, 2, 3, 4, 5].map(backoffMillis)).toEqual([
      4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
    expect(normalisedUserId("0123ABCD-ef")).toBe("0123abcdef");
  });
});
