import { describe, expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
const plugin = require("../scripts/babel/release-console.cjs");
const transform = (code: string): string =>
  transformSync(code, {
    configFile: false,
    babelrc: false,
    parserOpts: { allowReturnOutsideFunction: true },
    plugins: [plugin],
  }).code;

describe("release console output", () => {
  test("silences routine calls while preserving effects, spreads and undefined results", () => {
    const code = transform(
      "let effects = 0; const result = console.log(++effects, ...[2,3]); console.info(++effects); console.debug(++effects); return [effects, result];",
    );
    const output: string[] = [];
    const value = new Function("console", code)({
      log: () => output.push("log"),
      info: () => output.push("info"),
      debug: () => output.push("debug"),
    });
    expect(value).toEqual([3, undefined]);
    expect(output).toEqual([]);
  });
  test("retains warnings and errors", () => {
    const code = transform('console.warn("warning"); console.error("error");');
    const output: string[] = [];
    new Function("console", code)({
      warn: (v: string) => output.push(v),
      error: (v: string) => output.push(v),
    });
    expect(output).toEqual(["warning", "error"]);
  });
  test("does not change a locally shadowed console", () => {
    const code = transform(
      "const console = { log: () => 42 }; return console.log();",
    );
    expect(new Function(code)()).toBe(42);
  });
});
