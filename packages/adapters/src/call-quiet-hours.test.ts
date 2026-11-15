import { describe, expect, it } from "vitest";
import { isQuietHour } from "./call-request.js";

describe("isQuietHour", () => {
  it("is quiet from 22:00 to 07:00 in the user's timezone", () => {
    const at = new Date("2026-11-14T22:30:00Z");
    expect(isQuietHour(at, "UTC")).toBe(true);
    expect(isQuietHour(at, "America/Los_Angeles")).toBe(false);
    expect(isQuietHour(new Date("2026-11-14T06:59:00Z"), "Africa/Lagos")).toBe(false);
    expect(isQuietHour(new Date("2026-11-14T05:59:00Z"), "Africa/Lagos")).toBe(true);
  });

  it("falls back to UTC for an unknown timezone", () => {
    expect(isQuietHour(new Date("2026-11-14T23:00:00Z"), "Not/AZone")).toBe(true);
  });
});
