import { readFile } from "node:fs/promises";

/**
 * Host memory admission, after dori-superagent's loop gate: on a small host, starting one more
 * computer when memory is already short freezes everything, including the computers that run.
 * Off unless ARGO_MIN_FREE_MEMORY_MB is set.
 */
export function resolveMinFreeMemoryMb(value = process.env.ARGO_MIN_FREE_MEMORY_MB): number {
  if (value === undefined || value.trim() === "") return 0;
  const mb = Number(value);
  if (!Number.isSafeInteger(mb) || mb < 0) {
    throw new Error("ARGO_MIN_FREE_MEMORY_MB must be a whole number of megabytes, or 0 for off");
  }
  return mb;
}

/** MemAvailable in MB from /proc/meminfo text, or undefined when the line is missing. */
export function parseMemAvailableMb(meminfo: string): number | undefined {
  const match = meminfo.match(/^MemAvailable:\s+(\d+)\s*kB/m);
  if (!match) return undefined;
  return Math.floor(Number(match[1]) / 1024);
}

export type MemoryVerdict = { ok: true } | { ok: false; freeMb: number; needMb: number };

export async function checkHostMemory(
  needMb = resolveMinFreeMemoryMb(),
  read: () => Promise<string> = () => readFile("/proc/meminfo", "utf8"),
): Promise<MemoryVerdict> {
  if (needMb <= 0) return { ok: true };
  let freeMb: number | undefined;
  try {
    freeMb = parseMemAvailableMb(await read());
  } catch {
    // No /proc (macOS Docker Desktop host tools, tests): never block on a reading we cannot take.
    return { ok: true };
  }
  if (freeMb === undefined || freeMb >= needMb) return { ok: true };
  return { ok: false, freeMb, needMb };
}

export function memoryRefusal(verdict: { freeMb: number; needMb: number }): string {
  return `Not enough free memory to start another computer (${verdict.freeMb} MB free, ${verdict.needMb} MB required). Stop an idle computer or try again shortly.`;
}
