import { expect, test } from "bun:test";
import { AbortController as NativeAbortController } from "abort-controller/dist/abort-controller";
import { assertNotAborted } from "./abort";

test("phone signals without reason produce an abort; native DOMException stays immutable", () => {
  const phone = new NativeAbortController();
  phone.abort();
  try {
    assertNotAborted(phone.signal as unknown as AbortSignal);
  } catch (error) {
    expect((error as Error).name).toBe("AbortError");
  }
  const native = new AbortController();
  native.abort();
  expect(() => assertNotAborted(native.signal)).toThrow();
  try {
    assertNotAborted(native.signal);
  } catch (error) {
    expect(error).toBe(native.signal.reason);
    expect((error as Error).name).toBe("AbortError");
  }
});
test("the explicit preparation timeout is preserved rather than relabelled as cancellation", () => {
  const signal = new NativeAbortController();
  signal.abort();
  const timeout = new Error("download_preparation_timeout");
  try {
    assertNotAborted(signal.signal as unknown as AbortSignal, timeout);
  } catch (error) {
    expect(error).toBe(timeout);
    expect((error as Error).name).toBe("Error");
  }
});
