import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { daysUntil, getDueTone } from "./dueTone";

describe("due date helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 10, 15, 30)); // 10 April 2026, afternoon
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts whole days regardless of the time of day", () => {
    expect(daysUntil("2026-04-10")).toBe(0);
    expect(daysUntil("2026-04-17")).toBe(7);
    expect(daysUntil("2026-04-09")).toBe(-1);
    expect(daysUntil(null)).toBeNull();
  });

  it("maps due dates to tones", () => {
    expect(getDueTone("2026-04-01", true)).toBe("success");
    expect(getDueTone("2026-04-01", false)).toBe("danger");
    expect(getDueTone("2026-04-15", false)).toBe("warning");
    expect(getDueTone("2026-05-30", false)).toBe("neutral");
    expect(getDueTone(null, false)).toBe("neutral");
  });
});
