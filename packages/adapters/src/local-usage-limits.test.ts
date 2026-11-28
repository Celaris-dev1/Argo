import { afterEach, describe, expect, it, vi } from "vitest";
import { localUsageLimits } from "./pi-local-provider.js";

const limit = { id: "free", label: "Free", used: 10, limit: 100, resetsAt: "2026-01-02T00:00:00Z" };

describe("localUsageLimits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks a keyed endpoint for the member's limits", async () => {
    vi.stubEnv("ARGO_LOCAL_MODELS_URL", "https://models.example/v1/");
    vi.stubEnv("ARGO_LOCAL_MODELS_KEY", "deploy-key");
    const fetchMock = vi.fn(async () => Response.json({ limits: [limit] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await localUsageLimits("member-1")).toEqual([limit]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://models.example/v1/usage");
    expect(init.headers).toMatchObject({
      authorization: "Bearer deploy-key",
      "x-argo-member": "member-1",
    });
  });

  it("stays quiet when the endpoint is unkeyed, fails or answers badly", async () => {
    vi.stubEnv("ARGO_LOCAL_MODELS_URL", "https://models.example/v1");
    vi.stubEnv("ARGO_LOCAL_MODELS_KEY", "");
    const fetchMock = vi.fn(async () => Response.json({ limits: [limit] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await localUsageLimits("member-1")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.stubEnv("ARGO_LOCAL_MODELS_KEY", "deploy-key");
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    expect(await localUsageLimits("member-1")).toBeUndefined();
    fetchMock.mockResolvedValueOnce(Response.json({ limits: [{ id: "x" }] }));
    expect(await localUsageLimits("member-1")).toBeUndefined();
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect(await localUsageLimits("member-1")).toBeUndefined();
  });
});
