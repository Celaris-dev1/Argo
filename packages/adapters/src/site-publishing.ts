import { randomBytes } from "node:crypto";
import type { ComputerFileEntry } from "@argo/adapter-kit";
import { resolveBotWorkspacePath } from "./computer-support.js";
import type { RunContext } from "./run-context.js";
import type { ToolHandlers } from "./run-tool-gate.js";

/** Static files a site may hold; anything else in the folder is left out. */
const SITE_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};
export const SITE_MAX_FILES = 200;
export const SITE_MAX_BYTES = 25 * 1024 * 1024;
const SITE_MAX_DEPTH = 6;
const ID_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

export type SiteFiles = Record<string, { key: string; mimeType: string; size: number }>;

export function siteMimeType(path: string): string | undefined {
  const ext = path.split("/").pop()?.split(".").pop()?.toLowerCase();
  return ext ? SITE_TYPES[ext] : undefined;
}

export function siteId(): string {
  let id = "";
  for (const byte of randomBytes(10)) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** The public address of a site, relative when the deployment's web origin is unknown. */
export function siteUrl(id: string, origin = process.env.WEB_ORIGIN): string {
  return `${(origin ?? "").trim().replace(/\/$/, "")}/api/v1/sites/${id}/`;
}

/** A safe site path: forward slashes, no dot segments, no hidden files. */
export function sitePath(relative: string): string | undefined {
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part.startsWith("."))) return undefined;
  return parts.join("/");
}

/** Walks a folder breadth-first, keeping static files within the limits. */
export async function collectSiteFiles(
  list: (path: string) => Promise<ComputerFileEntry[]>,
  root: string,
): Promise<{ files: { path: string; full: string; size: number }[]; skipped: number }> {
  const base = root.replace(/\/+$/, "");
  const files: { path: string; full: string; size: number }[] = [];
  let skipped = 0;
  let total = 0;
  let level = [base];
  for (let depth = 0; depth < SITE_MAX_DEPTH && level.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      for (const entry of await list(dir)) {
        const full = entry.path.startsWith("/") ? entry.path : `${dir}/${entry.path}`;
        const relative = sitePath(full.slice(base.length + 1));
        if (!relative) continue;
        if (entry.kind === "dir") {
          next.push(full);
          continue;
        }
        if (
          !siteMimeType(relative) ||
          files.length >= SITE_MAX_FILES ||
          total + entry.size > SITE_MAX_BYTES
        ) {
          skipped++;
          continue;
        }
        total += entry.size;
        files.push({ path: relative, full, size: entry.size });
      }
    }
    level = next;
  }
  return { files, skipped };
}

export const siteTools: ToolHandlers = {
  async publish_site(ctx: RunContext, call) {
    const { deps, run, bot, context } = ctx;
    const folder = String(call.args.path ?? "").trim();
    if (!folder) return call.finish({ error: "path is required" });
    if (!deps.artifacts) return call.finish({ error: "file storage unavailable" });
    const computer = await ctx.computer.get("tool", call.name);
    const root = resolveBotWorkspacePath(ctx.computer.mode, bot.id, folder);
    let collected: Awaited<ReturnType<typeof collectSiteFiles>>;
    try {
      collected = await collectSiteFiles(
        (path) => deps.sandbox.listFiles(computer, path, context),
        root,
      );
    } catch {
      return call.finish({ error: "folder not found or unreadable", path: folder });
    }
    if (!collected.files.some((file) => file.path === "index.html")) {
      return call.finish({ error: "the folder needs an index.html", path: folder });
    }
    const files: SiteFiles = {};
    for (const file of collected.files) {
      const bytes = await deps.sandbox.readFile(computer, file.full, context, {
        maxBytes: SITE_MAX_BYTES,
      });
      const mimeType = siteMimeType(file.path)!;
      const stored = await deps.artifacts.put({ name: file.path, mimeType, bytes }, context);
      files[file.path] = { key: stored.id, mimeType, size: bytes.byteLength };
    }
    const where = { botId_source: { botId: bot.id, source: root } };
    const previous = await deps.prisma.publishedSite.findUnique({
      where,
      select: { files: true },
    });
    const site = await deps.prisma.publishedSite.upsert({
      where,
      create: {
        id: siteId(),
        botId: bot.id,
        spaceId: run.spaceId,
        userId: run.userId,
        source: root,
        files,
      },
      update: { files },
      select: { id: true },
    });
    const kept = new Set(Object.values(files).map((file) => file.key));
    for (const old of Object.values((previous?.files ?? {}) as SiteFiles)) {
      if (!kept.has(old.key)) await deps.artifacts.remove(old.key, context).catch(() => {});
    }
    return call.finish({
      ok: true,
      url: siteUrl(site.id),
      files: collected.files.length,
      ...(collected.skipped ? { skipped: collected.skipped } : {}),
    });
  },
};
