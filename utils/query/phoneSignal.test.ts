import { expect, test } from "bun:test";
import { phoneSignal } from "./phoneSignal";

/** React Query's context: reading `signal` is what opts the query in. */
const queryContext = () => {
  const controller = new AbortController();
  let read = false;
  return {
    context: {
      get signal() {
        read = true;
        return controller.signal;
      },
    },
    signal: controller.signal,
    wasRead: () => read,
  };
};

test("a phone takes the query's signal, so leaving cancels the request", () => {
  const { context, signal, wasRead } = queryContext();
  expect(phoneSignal(context, false)).toBe(signal);
  expect(wasRead()).toBe(true);
});

test("TV never reads the signal, so its requests are not cancelled", () => {
  const { context, wasRead } = queryContext();
  expect(phoneSignal(context, true)).toBeUndefined();
  expect(wasRead()).toBe(false);
});
