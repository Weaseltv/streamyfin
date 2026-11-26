import { describe, expect, test } from "bun:test";
import { emptyBackoff, isNewPin, offersForgotPin, wrongPin } from "./pinRules";

describe("WeaselPlex directional PIN", () => {
  test("accepts exactly four arrow presses for a new PIN", () => {
    expect(isNewPin("UDLR")).toBe(true);
    expect(isNewPin("UUUU")).toBe(true);
    for (const input of ["", "UDL", "UDLRU", "1234", "udlr", "U,L,R,D"]) {
      expect(isNewPin(input)).toBe(false);
    }
  });

  test("offers reset after more than three wrong entries", () => {
    expect(offersForgotPin(3)).toBe(false);
    expect(offersForgotPin(4)).toBe(true);
  });

  test("locks on the fifth wrong entry and doubles the wait up to an hour", () => {
    let state = emptyBackoff;
    for (let attempt = 0; attempt < 4; attempt++) state = wrongPin(state, 100);
    expect(state).toEqual({ failures: 4, lockouts: 0, until: 0 });
    expect(wrongPin(state, 100)).toEqual({
      failures: 0,
      lockouts: 1,
      until: 30_100,
    });
    expect(wrongPin({ ...state, lockouts: 1 }, 100)).toEqual({
      failures: 0,
      lockouts: 2,
      until: 60_100,
    });
    expect(wrongPin({ ...state, lockouts: 20 }, 100).until).toBe(3_600_100);
  });
});
