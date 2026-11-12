import { describe, expect, test } from "bun:test";
import { isNearScreen, NEAR_SCREEN_AHEAD } from "./nearScreen";

const SCREEN = 800;
const REACH = SCREEN * (1 + NEAR_SCREEN_AHEAD);

describe("isNearScreen", () => {
  test("a section on the screen of an unscrolled page is near", () => {
    expect(isNearScreen(0, 0, SCREEN)).toBe(true);
    expect(isNearScreen(SCREEN - 1, 0, SCREEN)).toBe(true);
  });

  test("a short page's section just below the fold is near", () => {
    expect(isNearScreen(SCREEN + 100, 0, SCREEN)).toBe(true);
    expect(isNearScreen(REACH, 0, SCREEN)).toBe(true);
  });

  test("a section further down waits", () => {
    expect(isNearScreen(REACH + 1, 0, SCREEN)).toBe(false);
    expect(isNearScreen(3000, 0, SCREEN)).toBe(false);
  });

  test("scrolling brings it near exactly when it comes within reach", () => {
    const top = 3000;
    expect(isNearScreen(top, top - REACH - 1, SCREEN)).toBe(false);
    expect(isNearScreen(top, top - REACH, SCREEN)).toBe(true);
  });

  test("a section already scrolled past is near", () => {
    expect(isNearScreen(500, 4000, SCREEN)).toBe(true);
  });

  test("a section that could not be placed starts rather than waits", () => {
    expect(isNearScreen(Number.NEGATIVE_INFINITY, 0, SCREEN)).toBe(true);
  });

  test("a taller screen reaches proportionally further", () => {
    expect(isNearScreen(1500, 0, 800)).toBe(false);
    expect(isNearScreen(1500, 0, 1200)).toBe(true);
  });
});
