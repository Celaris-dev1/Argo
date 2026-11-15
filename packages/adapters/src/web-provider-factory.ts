import type {
  AdapterContext,
  WebFetchRequest,
  WebFetchResult,
  WebProvider,
  WebSearchHit,
  WebSearchRequest,
} from "@argo/adapter-kit";
import { FakeWebProvider } from "./fake-web.js";
import { KeenableWebProvider } from "./keenable-web.js";
import { KeylessHttpWebProvider } from "./keyless-http-web.js";
import { ParallelWebProvider } from "./parallel-web.js";

/**
 * Pi 0.84 exposes no provider-neutral native-search API, so the default is keyless HTTP and core
 * runs with no hosted search vendor. A comma-separated list ("keyless,keenable") tries each
 * backend in order when the one before it fails or finds nothing.
 */
export function resolveWebProviderKind(source: NodeJS.ProcessEnv = process.env): string {
  const raw = source.WEB_PROVIDER?.trim().toLowerCase();
  if (!raw) return "keyless-http";
  const kinds = raw
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean)
    .map((kind) => (kind === "keyless" ? "keyless-http" : kind));
  return kinds.length ? kinds.join(",") : "keyless-http";
}

/** Compose the explicitly selected backend, retaining the keyless HTTP default. */
export function createWebProvider(
  kind: string = resolveWebProviderKind(),
  options?: ConstructorParameters<typeof KeylessHttpWebProvider>[0],
): WebProvider {
  const kinds = kind
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (kinds.length > 1) {
    return new FallbackWebProvider(kinds.map((k) => createWebProvider(k, options)));
  }
  switch (kinds[0] ?? "") {
    case "parallel":
      return new ParallelWebProvider(options);
    case "keenable":
      return new KeenableWebProvider(options);
    case "fake":
      return new FakeWebProvider();
    case "keyless-http":
    case "keyless":
    case "":
      return new KeylessHttpWebProvider(options);
    default:
      throw new Error(`Unknown web provider "${kind}"`);
  }
}

/**
 * Tries each backend in order. A search that throws or finds nothing moves to the next one,
 * so a keyless engine that rate-limits a busy server's address does not break web search.
 */
export class FallbackWebProvider implements WebProvider {
  constructor(private readonly providers: readonly WebProvider[]) {
    if (providers.length === 0) throw new Error("FallbackWebProvider needs at least one backend");
  }

  describe() {
    const first = this.providers[0]!.describe();
    return {
      ...first,
      id: this.providers.map((provider) => provider.describe().id).join(","),
      capabilities: {
        ...first.capabilities,
        keyless: this.providers.every((provider) => provider.describe().capabilities.keyless),
      },
    };
  }

  async search(request: WebSearchRequest, context: AdapterContext): Promise<WebSearchHit[]> {
    let lastError: unknown;
    for (const provider of this.providers) {
      (request.signal ?? context.signal).throwIfAborted();
      try {
        const hits = await provider.search(request, context);
        if (hits.length > 0) return hits;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return [];
  }

  async fetch(request: WebFetchRequest, context: AdapterContext): Promise<WebFetchResult> {
    let lastError: unknown;
    for (const provider of this.providers) {
      (request.signal ?? context.signal).throwIfAborted();
      try {
        return await provider.fetch(request, context);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
