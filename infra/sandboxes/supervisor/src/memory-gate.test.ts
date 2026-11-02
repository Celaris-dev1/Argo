import { describe, expect, it } from "vitest";
import {
  checkHostMemory,
  memoryRefusal,
  parseMemAvailableMb,
  resolveMinFreeMemoryMb,
} from "./memory-gate.js";

const MEMINFO =
  "MemTotal:        8000000 kB\nMemFree:          100000 kB\nMemAvailable:     1024000 kB\n";

describe("memory gate", () => {
  it("is off by default", async () => {
    expect(resolveMinFreeMemoryMb(undefined)).toBe(0);
    expect(resolveMinFreeMemoryMb("")).toBe(0);
    expect(await checkHostMemory(0, async () => MEMINFO)).toEqual({ ok: true });
  });

  it("rejects a bad value", () => {
    expect(() => resolveMinFreeMemoryMb("lots")).toThrow();
    expect(() => resolveMinFreeMemoryMb("-1")).toThrow();
  });

  it("reads MemAvailable", () => {
    expect(parseMemAvailableMb(MEMINFO)).toBe(1000);
    expect(parseMemAvailableMb("MemTotal: 1 kB")).toBeUndefined();
  });

  it("refuses below the floor and admits above it", async () => {
    expect(await checkHostMemory(1200, async () => MEMINFO)).toEqual({
      ok: false,
      freeMb: 1000,
      needMb: 1200,
    });
    expect(await checkHostMemory(800, async () => MEMINFO)).toEqual({ ok: true });
  });

  it("never blocks when meminfo cannot be read", async () => {
    expect(
      await checkHostMemory(1200, async () => {
        throw new Error("ENOENT");
      }),
    ).toEqual({ ok: true });
  });

  it("explains the refusal", () => {
    expect(memoryRefusal({ freeMb: 900, needMb: 1200 })).toMatch(/900 MB free, 1200 MB required/);
  });
});
