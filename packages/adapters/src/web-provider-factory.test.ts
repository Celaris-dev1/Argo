import type { AdapterContext, WebProvider } from "@argo/adapter-kit";
import { describe, expect, it } from "vitest";
import {
  createWebProvider,
  FallbackWebProvider,
  resolveWebProviderKind,
} from "./web-provider-factory.js";

const context = {
  operationId: "op",
  traceId: "trace",
  spaceId: "space",
  userId: "user",
  signal: new AbortController().signal,
} as AdapterContext;

function stub(
  id: string,
  search: WebProvider["search"],
  fetch?: WebProvider["fetch"],
): WebProvider {
  return {
    describe: () => ({
      id,
      contractVersion: "1",
      adapterVersion: "0",
      capabilities: { search: true, fetch: true, keyless: true, native: false, readability: true },
    }),
    search,
    fetch: fetch ?? (async () => ({ url: id, title: id, text: id })),
  } as WebProvider;
}

const hit = (url: string) => [{ url, title: url, snippet: "" }];

describe("web provider chain", () => {
  it("parses ordered lists and keeps the keyless default", () => {
    expect(resolveWebProviderKind({})).toBe("keyless-http");
    expect(resolveWebProviderKind({ WEB_PROVIDER: " Keyless , keenable " })).toBe(
      "keyless-http,keenable",
    );
    expect(createWebProvider("keyless,keenable")).toBeInstanceOf(FallbackWebProvider);
    expect(() => createWebProvider("keyless,nope")).toThrow(/nope/);
  });

  it("falls back when a backend throws or finds nothing", async () => {
    const chain = new FallbackWebProvider([
      stub("a", async () => {
        throw new Error("blocked");
      }),
      stub("b", async () => []),
      stub("c", async () => hit("https://c.example")),
    ]);
    expect(await chain.search({ query: "q" }, context)).toEqual(hit("https://c.example"));
    expect(chain.describe().id).toBe("a,b,c");
  });

  it("rethrows the last error when every backend fails", async () => {
    const chain = new FallbackWebProvider([
      stub("a", async () => []),
      stub(
        "b",
        async () => {
          throw new Error("down");
        },
        async () => {
          throw new Error("fetch down");
        },
      ),
    ]);
    await expect(chain.search({ query: "q" }, context)).rejects.toThrow("down");
    await expect(chain.fetch({ url: "https://x.example" }, context)).resolves.toMatchObject({
      url: "a",
    });
  });
});
