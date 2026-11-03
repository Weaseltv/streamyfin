import { describe, expect, test } from "bun:test";
import { INLINE_TEXT_SCALE } from "@/constants/neon";
import {
  EPISODE_PILL_CHROME,
  EPISODE_PILL_COLUMN_WIDTH,
  getEpisodePillColumnWidth,
  getEpisodePillFontSize,
  getEpisodePillLayout,
  measureEpisodeLabel,
} from "./episodePill";

/** What the Text wrapper draws: inline sizes scaled and rounded. */
const renderedSize = (label: string) =>
  Math.round(getEpisodePillLayout(label).fontSize * INLINE_TEXT_SCALE);

const singles = Array.from({ length: 999 }, (_, i) => `EP ${i + 1}`);
// Every combined file of two to four episodes, up to episode 999
const ranges = Array.from({ length: 998 }, (_, i) => i + 1).flatMap((start) =>
  [1, 2, 3]
    .map((more) => start + more)
    .filter((end) => end <= 999)
    .map((end) => `EP ${start}–${end}`),
);

describe("episode pill sizing", () => {
  test("type sizes are the approved ones, by kind of label", () => {
    for (const label of singles) expect(renderedSize(label)).toBe(12);
    for (const label of ranges) {
      const end = label.split("–")[1];
      expect(renderedSize(label)).toBe(end.length >= 3 ? 9 : 11);
    }
    expect(getEpisodePillFontSize("EP 1–2")).toBe(11);
    expect(getEpisodePillFontSize("EP 99–100")).toBe(9);
  });

  test("measurement counts each digit's own width (a 1 is narrow)", () => {
    expect(measureEpisodeLabel("EP 20–21", 11)).toBeGreaterThan(
      measureEpisodeLabel("EP 10–11", 11),
    );
    // Exo 2 Medium at 11pt, measured with fontTools: 45.2
    expect(measureEpisodeLabel("EP 20–21", 11)).toBeCloseTo(45.2, 0);
  });

  test("every label fits its pill, and every pill fits its list's column", () => {
    for (const label of [...singles, ...ranges]) {
      const layout = getEpisodePillLayout(label);
      const text = measureEpisodeLabel(label, renderedSize(label));
      expect(text).toBeLessThanOrEqual(layout.width - EPISODE_PILL_CHROME);
      expect(layout.width).toBeLessThanOrEqual(
        getEpisodePillColumnWidth([label]),
      );
      expect(layout.height).toBe(22);
    }
  });

  test("the reported two-digit ranges no longer clip", () => {
    const season = [
      "EP 12–13",
      "EP 16–17",
      "EP 18–19",
      "EP 20–21",
      "EP 22–23",
      "EP 24–25",
      "EP 26–27",
      "EP 28–29",
      "EP 30–31",
      "EP 32–33",
    ];
    const column = getEpisodePillColumnWidth(season);
    for (const label of season) {
      const layout = getEpisodePillLayout(label);
      expect(layout.width).toBeLessThanOrEqual(column);
      expect(measureEpisodeLabel(label, 11)).toBeLessThanOrEqual(
        layout.width - EPISODE_PILL_CHROME,
      );
    }
  });

  test("a season of single episodes keeps the approved 52-point column", () => {
    expect(getEpisodePillColumnWidth(singles)).toBe(EPISODE_PILL_COLUMN_WIDTH);
    expect(getEpisodePillColumnWidth([])).toBe(EPISODE_PILL_COLUMN_WIDTH);
  });

  test("seasons with ranges widen only as far as they need", () => {
    expect(getEpisodePillColumnWidth(["EP 1–2", "EP 3–4"])).toBe(52);
    expect(getEpisodePillColumnWidth(["EP 44–46"])).toBeLessThanOrEqual(60);
    expect(getEpisodePillColumnWidth(["EP 444–446"])).toBeLessThanOrEqual(62);
  });
});
