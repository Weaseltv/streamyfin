import { expect, test } from "bun:test";
import type { OptionGroup } from "@/components/PlatformDropdown";
import { buildMenuRows, placeMenu } from "./menuLayout";

const noop = () => {};

test("rows follow the iOS menu: titled radios as one submenu row, then toggles, then actions", () => {
  // The Library "..." menu (r1 20b), plus an action and an untitled group.
  const groups: OptionGroup[] = [
    {
      title: "Display",
      options: [
        {
          type: "radio",
          label: "Row",
          value: "row",
          selected: false,
          onPress: noop,
        },
        {
          type: "radio",
          label: "List",
          value: "list",
          selected: true,
          onPress: noop,
        },
      ],
    },
    {
      title: "Options",
      options: [
        { type: "action", label: "Reset", onPress: noop },
        { type: "toggle", label: "Show titles", value: true, onToggle: noop },
        {
          type: "toggle",
          label: "Show stats",
          value: false,
          onToggle: noop,
          disabled: true,
        },
      ],
    },
    {
      options: [
        { type: "radio", label: "A", value: 1, selected: true, onPress: noop },
        { type: "radio", label: "B", value: 2, selected: false, onPress: noop },
      ],
    },
  ];
  const rows = buildMenuRows(groups);
  expect(rows.map((row) => [row.label, row.check, !!row.children])).toEqual([
    ["Display: List", undefined, true],
    ["Show titles", "on", false],
    ["Show stats", "off", false],
    ["Reset", undefined, false],
    ["A", "on", false],
    ["B", "off", false],
  ]);
  expect(rows[0].children?.map((row) => [row.label, row.check])).toEqual([
    ["Row", "off"],
    ["List", "on"],
  ]);
  expect(rows[0].childrenTitle).toBe("Display");
  expect(rows[2].disabled).toBe(true);
});

test("a titled group with showSelection false shows only its title", () => {
  const rows = buildMenuRows([
    {
      title: "Speed",
      showSelection: false,
      icon: "speed",
      options: [
        { type: "radio", label: "1x", value: 1, selected: true, onPress: noop },
      ],
    },
  ]);
  expect(rows[0].label).toBe("Speed");
  expect(rows[0].icon).toBe("speed");
  expect(rows[0].children?.[0].check).toBe("on");
});

test("choosing a row runs the option and reports its value", () => {
  const picked: unknown[] = [];
  let pressed = 0;
  const rows = buildMenuRows(
    [
      {
        options: [
          {
            type: "radio",
            label: "English",
            value: "eng",
            selected: false,
            onPress: () => pressed++,
          },
          { type: "action", label: "Act", onPress: () => pressed++ },
        ],
      },
    ],
    (value) => picked.push(value),
  );
  rows[0].onPress?.();
  rows[1].onPress?.();
  expect(pressed).toBe(2);
  // Actions don't report a value, as on iOS.
  expect(picked).toEqual(["eng"]);
});

// The iPhone 17 Pro Max in points: 440 x 956, safe area 62 / 34.
const root = { x: 0, y: 0, width: 440, height: 956 };
const insets = { top: 62, bottom: 34, left: 0, right: 0 };
const base = {
  root,
  insets,
  margin: 8,
  maxHeightRatio: 0.54,
  estimatedHeight: 200,
};

test("a long menu under a right-hand trigger opens down over it, right edges aligned (r1 52c)", () => {
  const placement = placeMenu({
    ...base,
    // The Audio language dropdown on Settings › Audio & subtitles.
    anchor: { x: 290, y: 257, width: 118, height: 39 },
    size: { width: 250, height: 2000 },
  });
  expect(placement.origin).toBe("top");
  expect(placement.top).toBe(257);
  // Right edge on the trigger's right edge (408pt): 32pt from the screen's.
  expect(placement.right).toBe(32);
  expect(placement.left).toBeUndefined();
  // iOS stopped this list at 517pt.
  expect(placement.maxHeight).toBe(516);
});

test("a menu near the bottom opens upward from the trigger's bottom edge (r1 55c)", () => {
  const placement = placeMenu({
    ...base,
    anchor: { x: 290, y: 720, width: 118, height: 38 },
    size: { width: 250, height: 2000 },
  });
  expect(placement.origin).toBe("bottom");
  expect(placement.bottom).toBe(956 - 758);
  expect(placement.maxHeight).toBe(516);
});

test("a left-hand trigger aligns the card's left edge, kept inside the screen", () => {
  const placement = placeMenu({
    ...base,
    anchor: { x: 2, y: 300, width: 100, height: 30 },
    size: { width: 220, height: 100 },
  });
  expect(placement.alignRight).toBe(false);
  expect(placement.left).toBe(8);
  expect(placement.top).toBe(300);
});

test("before layout it opens from the estimate, anchored by the edge it aligns to", () => {
  const placement = placeMenu({
    ...base,
    anchor: { x: 290, y: 720, width: 118, height: 38 },
    size: null,
    estimatedHeight: 18 + 42 * 12,
  });
  expect(placement.origin).toBe("bottom");
  expect(placement.bottom).toBe(956 - 758);
  expect(placement.right).toBe(32);
});

test("the side chosen on open is kept when a submenu changes the size", () => {
  const first = placeMenu({
    ...base,
    anchor: { x: 300, y: 600, width: 44, height: 44 },
    size: { width: 250, height: 300 },
  });
  expect(first.origin).toBe("top");
  const second = placeMenu({
    ...base,
    anchor: { x: 300, y: 600, width: 44, height: 44 },
    size: { width: 250, height: 600 },
    previous: first,
  });
  expect(second.origin).toBe("top");
  expect(second.maxHeight).toBe(956 - 34 - 8 - 600);
});

test("landscape player: a top-right trigger with no safe-area inset", () => {
  const placement = placeMenu({
    ...base,
    root: { x: 0, y: 0, width: 956, height: 440 },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    anchor: { x: 880, y: 10, width: 44, height: 44 },
    size: { width: 250, height: 400 },
  });
  expect(placement.origin).toBe("top");
  expect(placement.top).toBe(10);
  expect(placement.right).toBe(956 - 924);
  expect(placement.maxHeight).toBe(Math.round(440 * 0.54));
});
