import { describe, expect, it } from "vitest";

import { sanitizeCsvCell, toCsvCell } from "./csv.js";

describe("CSV sanitization", () => {
  it("prefixes spreadsheet formula values", () => {
    expect(sanitizeCsvCell("=HYPERLINK(\"http://bad\")")).toBe("'=HYPERLINK(\"http://bad\")");
    expect(sanitizeCsvCell("+cmd")).toBe("'+cmd");
    expect(sanitizeCsvCell("-cmd")).toBe("'-cmd");
    expect(sanitizeCsvCell("@cmd")).toBe("'@cmd");
  });

  it("keeps normal values intact", () => {
    expect(sanitizeCsvCell("student@example.com")).toBe("student@example.com");
    expect(toCsvCell("hello")).toBe("\"hello\"");
  });
});
