import { describe, expect, test } from "bun:test";
import { INLINE_TEXT_SCALE } from "@/constants/neon";
import { EPISODE_PILL_COLUMN_WIDTH, getEpisodePillLayout } from "./episodePill";

const renderedSize = (label: string) =>
  Math.round(getEpisodePillLayout(label).fontSize * INLINE_TEXT_SCALE);

describe("episode pill sizing", () => {
  test("the reported short labels keep the normal size among mixed row content", () => {
    for (const label of [
      "EP 1–2",
      "EP 172–173",
      "EP 5",
      "EP 18",
      "EP 45",
      "EP 10–11",
      "EP 5",
      "EP 45",
      "EP 18",
    ]) {
      if (["EP 5", "EP 18", "EP 45"].includes(label)) {
        expect(renderedSize(label)).toBe(12);
      }
    }
  });

  test("all ordinary episode numbers retain uniform readable type", () => {
    for (let number = 1; number <= 999; number++) {
      expect(renderedSize(`EP ${number}`)).toBe(12);
    }
  });

  test("representative labels fit the frame at the bundled Exo 2 Medium metrics", () => {
    // Reference advances at 12pt, measured from assets/fonts/Exo2-Medium.ttf.
    const widthsAt12: [string, number][] = [
      ["EP 5", 22.796875],
      ["EP 18", 28.484375],
      ["EP 45", 30.21875],
      ["EP 400", 38.34375],
      ["EP 1–2", 35],
      ["EP 10–11", 44.796875],
      ["EP 172–173", 58.53125],
    ];
    for (const [label, width] of widthsAt12) {
      const layout = getEpisodePillLayout(label);
      const fontSize = renderedSize(label);
      const available = layout.width - 2 * (3 + 1); // padding and border
      expect((width * fontSize) / 12).toBeLessThanOrEqual(available);
      expect(fontSize).toBeGreaterThanOrEqual(9);
      expect(layout.width).toBeLessThanOrEqual(EPISODE_PILL_COLUMN_WIDTH);
      expect(layout.height).toBe(22);
    }
  });
});
