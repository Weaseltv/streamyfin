import { describe, expect, test } from "bun:test";
import {
  confirmed,
  failed,
  idleRunner,
  POLICY_RETRY_GAP_MS,
  policySessionKey,
  sessionChanged,
  tick,
  trigger,
} from "./policy";

const T0 = 1_800_000_000_000;
const S = "https://media.theweasel.tv|token|user";

describe("rule 8: policy confirmation", () => {
  test("a new session starts one attempt; its answer confirms", () => {
    const start = sessionChanged(idleRunner(), S, T0);
    expect(start.attempt).toBe(true);
    expect(start.runner.status).toBe("checking");
    expect(confirmed(start.runner, S).runner.status).toBe("confirmed");
  });

  test("an answer for a previous session changes nothing", () => {
    const r = sessionChanged(idleRunner(), S, T0).runner;
    expect(confirmed(r, "old").runner).toBe(r);
    expect(failed(r, "old", T0).runner).toBe(r);
  });

  test("offline start: the network returning inside a minute waits; at the minute it tries again", () => {
    let r = sessionChanged(idleRunner(), S, T0).runner;
    r = failed(r, S, T0 + 15_000).runner;
    expect(r.status).toBe("unconfirmed");
    const early = trigger(r, "network", T0 + 20_000);
    expect(early.attempt).toBe(false);
    expect(early.runner.pending).toBe(true);
    expect(early.wakeInMs).toBe(POLICY_RETRY_GAP_MS - 20_000);
    const later = tick(early.runner, T0 + POLICY_RETRY_GAP_MS);
    expect(later.attempt).toBe(true);
    expect(confirmed(later.runner, S).runner.status).toBe("confirmed");
  });

  test("a trigger during an attempt is kept and runs once that attempt fails", () => {
    let r = sessionChanged(idleRunner(), S, T0).runner;
    const during = trigger(r, "foreground", T0 + 5_000);
    expect(during.attempt).toBe(false);
    r = during.runner;
    expect(r.pending).toBe(true);
    const afterFail = failed(r, S, T0 + POLICY_RETRY_GAP_MS + 1);
    expect(afterFail.attempt).toBe(true);
  });

  test("Retry too soon says it is still checking; never silently ignored", () => {
    let r = sessionChanged(idleRunner(), S, T0).runner;
    expect(trigger(r, "retry", T0 + 1).tooSoon).toBe(true);
    r = failed(r, S, T0 + 2).runner;
    const soon = trigger(r, "retry", T0 + 10_000);
    expect(soon.tooSoon).toBe(true);
    expect(soon.attempt).toBe(false);
    expect(
      trigger(soon.runner, "retry", T0 + POLICY_RETRY_GAP_MS).attempt,
    ).toBe(true);
  });

  test("a session change cancels a kept retry; sign-out resets", () => {
    let r = sessionChanged(idleRunner(), S, T0).runner;
    r = trigger(r, "network", T0 + 1).runner;
    const next = sessionChanged(r, "other", T0 + 2);
    expect(next.runner.pending).toBe(false);
    expect(next.attempt).toBe(true);
    expect(sessionChanged(next.runner, null, T0 + 3).runner).toEqual(
      idleRunner(),
    );
  });

  test("nothing runs once confirmed", () => {
    const r = confirmed(sessionChanged(idleRunner(), S, T0).runner, S).runner;
    expect(trigger(r, "retry", T0 + 1).attempt).toBe(false);
    expect(
      tick({ ...r, pending: true }, T0 + POLICY_RETRY_GAP_MS).attempt,
    ).toBe(false);
  });

  test("session keys combine server, token and user", () => {
    expect(policySessionKey("https://Media.Example/", "tok", "AB-CD")).toBe(
      "https://media.example|tok|abcd",
    );
    expect(policySessionKey(null, "tok", "u")).toBeNull();
  });
});
