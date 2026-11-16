import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { localCodingEnv, mintCodingToken } from "./coding-mode.js";

const source = {
  ARGO_LOCAL_MODELS_URL: "https://models.example.test/v1",
  ARGO_LOCAL_CODING_KEY: "coding-key",
  ARGO_LOCAL_CODING_MODELS: "fast-coder, deep-coder",
} as NodeJS.ProcessEnv;

describe("local coding models", () => {
  it("gives OpenCode the endpoint, the narrower key and the first model by default", () => {
    const previous = process.env.ARGO_LOCAL_MODELS_URL;
    process.env.ARGO_LOCAL_MODELS_URL = source.ARGO_LOCAL_MODELS_URL;
    try {
      const result = localCodingEnv("", "user_1", source, 0);
      expect(result.model).toBe("local/fast-coder");
      expect(result.secret).toBe(mintCodingToken("coding-key", "user_1", 0));
      expect(result.env.ARGO_LOCAL_CODING_KEY).toBe(result.secret);
      expect(result.secret).not.toContain("coding-key");
      const config = JSON.parse(result.env.OPENCODE_CONFIG_CONTENT!);
      expect(config.provider.local.options).toEqual({
        baseURL: "https://models.example.test/v1",
        apiKey: "{env:ARGO_LOCAL_CODING_KEY}",
      });
      expect(Object.keys(config.provider.local.models)).toEqual(["fast-coder", "deep-coder"]);
    } finally {
      if (previous === undefined) delete process.env.ARGO_LOCAL_MODELS_URL;
      else process.env.ARGO_LOCAL_MODELS_URL = previous;
    }
  });

  it("honours a model the user named, by id or part of it", () => {
    expect(localCodingEnv("local/deep-coder", "u", source).model).toBe("local/deep-coder");
    expect(localCodingEnv("Deep", "u", source).model).toBe("local/deep-coder");
    expect(localCodingEnv("unknown", "u", source).model).toBe("local/fast-coder");
  });

  it("never falls back to the deployment's main key", () => {
    expect(localCodingEnv("", "u", { ...source, ARGO_LOCAL_CODING_KEY: "" })).toEqual({ env: {} });
    expect(localCodingEnv("", "u", { ...source, ARGO_LOCAL_CODING_MODELS: "" })).toEqual({
      env: {},
    });
  });

  it("signs a twelve-hour token naming the member", () => {
    const token = mintCodingToken("coding-key", "user_1", 1_000_000);
    const [prefix, payload, sig] = token.split(".");
    expect(prefix).toBe("ck1");
    expect(JSON.parse(Buffer.from(payload!, "base64url").toString())).toEqual({
      u: "user_1",
      e: 1000 + 12 * 3600,
    });
    expect(sig).toBe(createHmac("sha256", "coding-key").update(payload!).digest("base64url"));
  });
});
