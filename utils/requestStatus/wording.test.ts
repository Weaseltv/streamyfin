import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../translations/en.json";

type Tree = { [key: string]: Tree | string };
const flatten = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`),
  );

const dir = import.meta.dir;
const sources = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");
const used = new Set(
  [...sources.matchAll(/"(request_status\.[a-z_.]+)"/g)].map((m) => m[1]),
);
const defined = new Set(
  flatten((en as unknown as Tree).request_status as Tree, "request_status."),
);

describe("request status wording", () => {
  test("every key the logic returns exists in en.json", () => {
    expect([...used].filter((k) => !defined.has(k))).toEqual([]);
  });

  test("every request_status key in en.json is used by the logic", () => {
    expect([...defined].filter((k) => !used.has(k))).toEqual([]);
  });

  test("placeholders match the values the logic passes", () => {
    const tree = (en as unknown as Tree).request_status as Tree;
    const lookup = (key: string) =>
      key
        .split(".")
        .slice(1)
        .reduce<Tree | string>(
          (node, part) => (node as Tree)[part],
          tree,
        ) as string;
    expect(lookup("request_status.status.downloading_percent")).toContain(
      "{{percent}}",
    );
    expect(lookup("request_status.detail.with_last_known")).toContain(
      "{{detail}}",
    );
    expect(lookup("request_status.progress.episodes_out")).toContain(
      "{{aired}}",
    );
    expect(lookup("request_status.submission.not_authorized")).toContain(
      "{{status}}",
    );
  });
});
