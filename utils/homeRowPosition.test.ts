import { describe, expect, test } from "bun:test";
import { HomeRowPosition, type HomeRowSnapshot } from "./homeRowPosition";

const initial: HomeRowSnapshot = {
  scope: "server/member/recent",
  revision: 0,
  items: ["a", "b"],
  pages: 1,
};
function row() {
  const position = new HomeRowPosition();
  let offset = 400,
    commands = 0;
  const scroll = () => {
    offset = 0;
    commands++;
  };
  position.observe(initial);
  return {
    position,
    scroll,
    move: (value: number) => {
      offset = value;
    },
    offset: () => offset,
    commands: () => commands,
  };
}

describe("phone Home row position", () => {
  test("cold start resets only after the native list is ready", () => {
    const r = row();
    expect(r.position.flush(false, r.scroll)).toBe(false);
    expect(r.offset()).toBe(400);
    expect(r.position.flush(true, r.scroll)).toBe(true);
    expect(r.offset()).toBe(0);
    expect(r.position.flush(true, r.scroll)).toBe(false);
    expect(r.commands()).toBe(1);
  });

  test("a Home reset restarts every mounted row without changing data", () => {
    const rows = [row(), row(), row()];
    for (const r of rows) {
      r.position.flush(true, r.scroll);
      r.move(800);
      r.position.observe({ ...initial, revision: 1 });
      expect(r.position.flush(true, r.scroll)).toBe(true);
      expect(r.offset()).toBe(0);
    }
  });

  test("scroll callbacks cannot recursively consume the same reset", () => {
    const r = row();
    let calls = 0;
    r.position.flush(true, () => {
      calls++;
      r.position.flush(true, () => {
        calls++;
      });
    });
    expect(calls).toBe(1);
  });

  test("late-loaded and offscreen rows consume the current Home reset", () => {
    const r = row();
    r.position.flush(true, r.scroll);
    r.move(800);
    r.position.observe({ ...initial, revision: 2 });
    expect(r.position.flush(false, r.scroll)).toBe(false);
    expect(r.offset()).toBe(800);
    r.position.observe({ ...initial, revision: 2 });
    r.position.flush(true, r.scroll);
    expect(r.offset()).toBe(0);
  });

  test("new, reordered, and removed cards reset a row", () => {
    for (const items of [
      ["new", "a", "b"],
      ["a", "b", "new"],
      ["b", "a"],
      ["b"],
    ]) {
      const r = row();
      r.position.flush(true, r.scroll);
      r.move(800);
      r.position.observe({ ...initial, items });
      r.position.flush(true, r.scroll);
      expect(r.offset()).toBe(0);
    }
  });

  test("loading the next page preserves browsing position", () => {
    const r = row();
    r.position.flush(true, r.scroll);
    r.move(800);
    r.position.observe({ ...initial, items: ["a", "b", "c", "d"], pages: 2 });
    expect(r.position.flush(true, r.scroll)).toBe(false);
    expect(r.offset()).toBe(800);
    // A later server refresh appends a card without loading another page.
    r.position.observe({
      ...initial,
      items: ["a", "b", "c", "d", "new"],
      pages: 2,
    });
    expect(r.position.flush(true, r.scroll)).toBe(true);
    expect(r.offset()).toBe(0);
  });

  test("a new card at the front resets even if another page also arrives", () => {
    const r = row();
    r.position.flush(true, r.scroll);
    r.move(800);
    r.position.observe({ ...initial, items: ["new", "a", "b", "c"], pages: 2 });
    r.position.flush(true, r.scroll);
    expect(r.offset()).toBe(0);
  });

  test("finite streaming, curated and plugin rows also reset on additions", () => {
    const r = row();
    r.position.observe({ ...initial, pages: undefined });
    r.position.flush(true, r.scroll);
    r.move(800);
    r.position.observe({
      ...initial,
      pages: undefined,
      items: ["a", "b", "new"],
    });
    r.position.flush(true, r.scroll);
    expect(r.offset()).toBe(0);
  });

  test("progress-only updates and repeated layout callbacks do not interrupt browsing", () => {
    const r = row();
    r.position.flush(true, r.scroll);
    r.move(800);
    r.position.observe({ ...initial, items: [...initial.items] });
    expect(r.position.flush(true, r.scroll)).toBe(false);
    expect(r.position.flush(true, r.scroll)).toBe(false);
    expect(r.offset()).toBe(800);
  });

  test("account or recycled row identity changes cannot reuse a previous offset", () => {
    const r = row();
    r.position.flush(true, r.scroll);
    r.move(800);
    r.position.observe({
      ...initial,
      scope: "other-server/other-member/trending",
    });
    r.position.flush(true, r.scroll);
    expect(r.offset()).toBe(0);
  });

  test("a remounted list resets even if its item IDs did not change", () => {
    const r = row();
    r.position.flush(true, r.scroll);
    r.move(800);
    r.position.request();
    r.position.flush(true, r.scroll);
    expect(r.offset()).toBe(0);
  });

  test("a native layout failure is retried on the next ready/layout callback", () => {
    const r = row();
    expect(
      r.position.flush(true, () => {
        throw new Error("not laid out");
      }),
    ).toBe(false);
    expect(r.position.flush(true, r.scroll)).toBe(true);
    expect(r.offset()).toBe(0);
  });
});
