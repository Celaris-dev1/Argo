import { describe, expect, it, vi } from "vitest";
import { readPublishedSiteFile, SITE_HEADERS, siteFileFor } from "./published-sites.js";

const files = {
  "index.html": { key: "k-index", mimeType: "text/html; charset=utf-8", size: 5 },
  "docs/index.html": { key: "k-docs", mimeType: "text/html; charset=utf-8", size: 5 },
  "app.js": { key: "k-js", mimeType: "text/javascript; charset=utf-8", size: 5 },
};

function fake(site: unknown) {
  return {
    prisma: { publishedSite: { findUnique: vi.fn(async () => site) } },
    artifacts: { get: vi.fn(async () => new TextEncoder().encode("hello")) },
  };
}

describe("published sites", () => {
  it("maps folders to their index and refuses paths outside the site", () => {
    expect(siteFileFor(files, "")?.key).toBe("k-index");
    expect(siteFileFor(files, "docs/")?.key).toBe("k-docs");
    expect(siteFileFor(files, "app.js")?.key).toBe("k-js");
    expect(siteFileFor(files, "../secret")).toBeUndefined();
    expect(siteFileFor(files, "%2e%2e/x")).toBeUndefined();
    expect(siteFileFor(files, "constructor")).toBeUndefined();
  });

  it("sandboxes every page away from the app's origin", () => {
    expect(SITE_HEADERS["content-security-policy"]).toMatch(/^sandbox /);
    expect(SITE_HEADERS["content-security-policy"]).not.toContain("allow-same-origin");
    expect(SITE_HEADERS["x-content-type-options"]).toBe("nosniff");
  });

  it("reads a published file and hides archived bots and bad ids", async () => {
    const live = fake({ botId: "b", spaceId: "s", userId: "u", files, bot: { archivedAt: null } });
    const file = await readPublishedSiteFile(
      live.prisma as never,
      live.artifacts as never,
      "abc123",
      "",
    );
    expect(file?.mimeType).toBe("text/html; charset=utf-8");
    expect(live.artifacts.get).toHaveBeenCalledWith(
      "k-index",
      expect.objectContaining({ spaceId: "s" }),
    );

    const archived = fake({
      botId: "b",
      spaceId: "s",
      userId: "u",
      files,
      bot: { archivedAt: new Date() },
    });
    expect(
      await readPublishedSiteFile(
        archived.prisma as never,
        archived.artifacts as never,
        "abc123",
        "",
      ),
    ).toBeNull();
    expect(
      await readPublishedSiteFile(live.prisma as never, live.artifacts as never, "../etc", ""),
    ).toBeNull();
    expect(
      await readPublishedSiteFile(
        live.prisma as never,
        live.artifacts as never,
        "abc123",
        "missing.css",
      ),
    ).toBeNull();
  });
});
