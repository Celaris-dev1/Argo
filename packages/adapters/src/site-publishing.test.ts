import type { ComputerFileEntry } from "@argo/adapter-kit";
import { describe, expect, it } from "vitest";
import {
  collectSiteFiles,
  SITE_MAX_BYTES,
  SITE_MAX_FILES,
  siteMimeType,
  sitePath,
  siteUrl,
} from "./site-publishing.js";

function tree(entries: Record<string, ComputerFileEntry[]>) {
  return async (path: string) => {
    const found = entries[path];
    if (!found) throw new Error(`no folder ${path}`);
    return found;
  };
}

describe("site publishing", () => {
  it("serves only static types", () => {
    expect(siteMimeType("index.html")).toBe("text/html; charset=utf-8");
    expect(siteMimeType("assets/app.JS")).toBe("text/javascript; charset=utf-8");
    expect(siteMimeType("server.py")).toBeUndefined();
    expect(siteMimeType(".env")).toBeUndefined();
  });

  it("rejects hidden files and dot segments", () => {
    expect(sitePath("css/site.css")).toBe("css/site.css");
    expect(sitePath(".git/config")).toBeUndefined();
    expect(sitePath("a/../b")).toBeUndefined();
    expect(sitePath("")).toBeUndefined();
  });

  it("links from the web origin, or relatively without one", () => {
    expect(siteUrl("abc123", "https://argo.test/")).toBe("https://argo.test/api/v1/sites/abc123/");
    expect(siteUrl("abc123", "")).toBe("/api/v1/sites/abc123/");
  });

  it("walks folders, keeping static files and skipping the rest", async () => {
    const list = tree({
      "/w/site": [
        { path: "index.html", kind: "file", size: 10 },
        { path: "notes.py", kind: "file", size: 10 },
        { path: ".env", kind: "file", size: 10 },
        { path: "css", kind: "dir", size: 0 },
        { path: ".git", kind: "dir", size: 0 },
      ],
      "/w/site/css": [{ path: "/w/site/css/site.css", kind: "file", size: 5 }],
    });
    const { files, skipped } = await collectSiteFiles(list, "/w/site/");
    expect(files.map((file) => file.path).sort()).toEqual(["css/site.css", "index.html"]);
    expect(files.find((file) => file.path === "css/site.css")?.full).toBe("/w/site/css/site.css");
    expect(skipped).toBe(1);
  });

  it("stops at the file and size limits", async () => {
    const many = Array.from({ length: SITE_MAX_FILES + 5 }, (_, i) => ({
      path: `p${i}.html`,
      kind: "file" as const,
      size: 1,
    }));
    expect((await collectSiteFiles(tree({ "/s": many }), "/s")).files).toHaveLength(SITE_MAX_FILES);
    const big = [
      { path: "index.html", kind: "file" as const, size: 10 },
      { path: "video.mp4", kind: "file" as const, size: SITE_MAX_BYTES },
    ];
    const result = await collectSiteFiles(tree({ "/s": big }), "/s");
    expect(result.files.map((file) => file.path)).toEqual(["index.html"]);
    expect(result.skipped).toBe(1);
  });
});
