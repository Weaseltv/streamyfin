import { expect, test } from "bun:test";
import { createNavTiming } from "./navTimingCore";

const setup = () => {
  let clock = 0;
  const lines: string[] = [];
  const timing = createNavTiming({
    now: () => clock,
    emit: (line) => lines.push(line),
  });
  return {
    timing,
    lines,
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

test("reports one line with both stages once the page is full", () => {
  const { timing, lines, advance } = setup();
  timing.tap("series", "a");
  advance(120);
  timing.stage("series", "a", "content");
  expect(lines).toEqual([]);
  advance(300);
  timing.stage("series", "a", "full");
  expect(lines).toEqual(["nav-timing series content=120ms full=420ms"]);
});

test("a page that becomes full at once reports the same time for both", () => {
  const { timing, lines, advance } = setup();
  timing.tap("item", "a");
  advance(250);
  timing.stage("item", "a", "full");
  expect(lines).toEqual(["nav-timing item content=250ms full=250ms"]);
});

test("ignores a page that was not opened by the last tap", () => {
  const { timing, lines, advance } = setup();
  timing.stage("item", "a", "full");
  timing.tap("item", "a");
  advance(50);
  timing.stage("item", "b", "full");
  timing.stage("series", "a", "full");
  expect(lines).toEqual([]);
});

test("reports each stage once and nothing after the page is done", () => {
  const { timing, lines, advance } = setup();
  timing.tap("collection", "a");
  advance(10);
  timing.stage("collection", "a", "content");
  advance(10);
  timing.stage("collection", "a", "content");
  timing.stage("collection", "a", "full");
  advance(10);
  timing.stage("collection", "a", "full");
  expect(lines).toEqual(["nav-timing collection content=10ms full=20ms"]);
});

test("a page left early reports what it reached when the next tap comes", () => {
  const { timing, lines, advance } = setup();
  timing.tap("series", "a");
  advance(90);
  timing.stage("series", "a", "content");
  advance(400);
  timing.tap("item", "b");
  expect(lines).toEqual(["nav-timing series content=90ms"]);
  timing.tap("item", "c");
  expect(lines).toEqual(["nav-timing series content=90ms"]);
});

test("a stage that arrives long after the tap is dropped", () => {
  const { timing, lines, advance } = setup();
  timing.tap("library", "a");
  advance(40_000);
  timing.stage("library", "a", "full");
  advance(10);
  timing.stage("library", "a", "full");
  expect(lines).toEqual([]);
});
