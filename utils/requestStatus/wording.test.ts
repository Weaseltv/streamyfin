import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../translations/en.json";

type Tree = { [key: string]: Tree | string };
const flatten = (tree: Tree, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : flatten(v, `${prefix}${k}.`),
  );

const root = join(import.meta.dir, "..", "..");
const SKIP = new Set(["node_modules", ".git", "ios", "android"]);
// The request server's own source (a submodule) is not app code.
const SUBMODULE = join(root, "utils", "jellyseerr");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory())
      return SKIP.has(e.name) || path === SUBMODULE ? [] : walk(path);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [path] : [];
  });
const sources = ["app", "components", "hooks", "providers", "utils"]
  .flatMap((d) => walk(join(root, d)))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const used = new Set(
  [...sources.matchAll(/"(request_status\.[a-z0-9_.]+)"/g)].map((m) => m[1]),
);
const defined = new Set(
  flatten((en as unknown as Tree).request_status as Tree, "request_status."),
);

describe("request status wording", () => {
  test("every request_status key the app uses exists in en.json", () => {
    expect([...used].filter((k) => !defined.has(k))).toEqual([]);
  });

  test("every request_status key in en.json is used", () => {
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
