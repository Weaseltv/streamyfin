import { describe, expect, test } from "bun:test";
import { sanitizeKidName, validKidNameOrNull } from "./kidNames";

// Port of the TV's KidNamesTest (contract section 2).
describe("kid names", () => {
  test("follow the website's rule", () => {
    expect(sanitizeKidName("  Emma  ")).toBe("Emma");
    expect(sanitizeKidName("Mary   Jo")).toBe("Mary Jo");
    expect(sanitizeKidName("Zoë")).toBe("Zoë");
    expect(sanitizeKidName("B<o>b!")).toBe("Bob");
    expect(sanitizeKidName("O'Neil-Smith Jr.")).toBe("O'Neil-Smith Jr.");
    expect(validKidNameOrNull("   ")).toBeNull();
    expect(validKidNameOrNull("!!!")).toBeNull();
    expect(validKidNameOrNull("a".repeat(21))).toBeNull();
    expect(validKidNameOrNull("a".repeat(20))).toBe("a".repeat(20));
  });
});
