import { expect, test } from "bun:test";
import {
  type BackdropState,
  finishBackdrop,
  nextBackdrop,
} from "./readyBackdrop";

test("keep visible art until the next source loads; failed sources never blank it", () => {
  const first: BackdropState = { visible: "a", pending: null, failed: [] };
  const pending = nextBackdrop(first, ["a", "b", "c"]);
  expect(pending.visible).toBe("a");
  expect(pending.pending).toBe("b");
  const failed = finishBackdrop(pending, "b", false);
  expect(failed.visible).toBe("a");
  expect(nextBackdrop(failed, ["a", "b", "c"]).pending).toBe("c");
  expect(finishBackdrop(pending, "obsolete", true)).toBe(pending);
  expect(finishBackdrop(pending, "b", true).visible).toBe("b");
});

test("several complete rotations and all failed alternatives stay bounded", () => {
  let state: BackdropState = { visible: null, pending: null, failed: [] };
  for (let i = 0; i < 12; i++) {
    state = nextBackdrop(state, ["a", "b", "c"]);
    state = finishBackdrop(state, state.pending!, true);
    expect(state.visible).toBe(["a", "b", "c"][i % 3]);
  }
  const exhausted: BackdropState = {
    visible: "a",
    pending: null,
    failed: ["b", "c"],
  };
  expect(nextBackdrop(exhausted, ["a", "b", "c"])).toBe(exhausted);
});
