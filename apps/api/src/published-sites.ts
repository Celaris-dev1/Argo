import type { ArtifactStore } from "@argo/adapter-kit";
import { createAdapterContext } from "@argo/adapter-kit";
import type { PrismaClient } from "@argo/db";
import { runAsSystem } from "@argo/db";

type SiteFiles = Record<string, { key: string; mimeType: string; size: number }>;

/**
 * Published sites run whatever their bot wrote, so they get no access to Argo: the sandbox CSP
 * gives each page an opaque origin (no cookies, storage or same-origin requests to the app), and
 * it can still run its own scripts, forms and links.
 */
export const SITE_HEADERS: Record<string, string> = {
  "content-security-policy":
    "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "public, max-age=60",
};

/** The file a site path asks for: the folder's index.html for a folder path. */
export function siteFileFor(files: SiteFiles, path: string): SiteFiles[string] | undefined {
  const clean = decodeURIComponent(path).replace(/^\/+/, "");
  if (clean.split("/").some((part) => part === ".." || part.startsWith("."))) return undefined;
  const wanted = !clean || clean.endsWith("/") ? `${clean}index.html` : clean;
  return Object.hasOwn(files, wanted) ? files[wanted] : undefined;
}

/** Anyone with the link reads the site's own files; nothing else of the owner's. */
export async function readPublishedSiteFile(
  prisma: PrismaClient,
  artifacts: ArtifactStore,
  id: string,
  path: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!/^[a-z0-9]{6,32}$/.test(id)) return null;
  return runAsSystem("read a published site", async () => {
    const site = await prisma.publishedSite.findUnique({
      where: { id },
      select: {
        botId: true,
        spaceId: true,
        userId: true,
        files: true,
        bot: { select: { archivedAt: true } },
      },
    });
    if (!site || site.bot.archivedAt) return null;
    let file: SiteFiles[string] | undefined;
    try {
      file = siteFileFor(site.files as SiteFiles, path);
    } catch {
      return null;
    }
    if (!file) return null;
    const bytes = await artifacts.get(
      file.key,
      createAdapterContext(site, site.botId, `site-get:${id}`),
    );
    return { bytes, mimeType: file.mimeType };
  });
}
