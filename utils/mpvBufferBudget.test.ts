import { describe, expect, it, mock } from "bun:test";

mock.module("expo", () => ({ requireOptionalNativeModule: () => null }));
mock.module("react-native", () => ({
  Platform: { OS: "android", isTV: false },
}));

const { androidPhoneBudget, LEGACY_PHONE_BUDGET } = await import(
  "./mpvBufferBudget"
);

describe("androidPhoneBudget", () => {
  it("keeps the old budget when memory is unknown", () => {
    expect(androidPhoneBudget(undefined)).toEqual(LEGACY_PHONE_BUDGET);
  });

  it("gives low-RAM and 2 GB phones the smallest budget", () => {
    expect(androidPhoneBudget({ totalMb: 1900, lowRam: false })).toEqual({
      maxBytes: 50,
      maxBackBytes: 20,
    });
    expect(androidPhoneBudget({ totalMb: 6000, lowRam: true })).toEqual({
      maxBytes: 50,
      maxBackBytes: 20,
    });
  });

  it("matches the Android TV tier at 3 GB", () => {
    expect(androidPhoneBudget({ totalMb: 2900, lowRam: false })).toEqual({
      maxBytes: 75,
      maxBackBytes: 30,
    });
  });

  it("steps up at 4 GB and keeps the full budget above", () => {
    expect(androidPhoneBudget({ totalMb: 3800, lowRam: false })).toEqual({
      maxBytes: 100,
      maxBackBytes: 40,
    });
    expect(androidPhoneBudget({ totalMb: 7700, lowRam: false })).toEqual(
      LEGACY_PHONE_BUDGET,
    );
  });
});
