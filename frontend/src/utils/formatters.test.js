import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatFileSize } from "./formatters";

describe("formatCurrency", () => {
  it("formats euros with Italian separators", () => {
    // Italian locale groups thousands only from 5 digits up.
    expect(formatCurrency("12345.5")).toMatch(/12\.345,50\s€/);
  });

  it("treats missing values as zero", () => {
    expect(formatCurrency(null)).toMatch(/0,00\s€/);
  });
});

describe("formatDate", () => {
  it("formats ISO dates as dd/mm/yy", () => {
    expect(formatDate("2026-04-09")).toBe("09/04/26");
  });

  it("returns a dash for empty values and echoes invalid input", () => {
    expect(formatDate("")).toBe("-");
    expect(formatDate("non-una-data")).toBe("non-una-data");
  });
});

describe("formatFileSize", () => {
  it("picks a readable unit", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
