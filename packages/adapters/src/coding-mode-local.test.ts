import { describe, expect, it } from "vitest";
import { localCodingEnv } from "./coding-mode.js";

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
      const result = localCodingEnv("", source);
      expect(result.model).toBe("local/fast-coder");
      expect(result.secret).toBe("coding-key");
      expect(result.env.ARGO_LOCAL_CODING_KEY).toBe("coding-key");
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
    expect(localCodingEnv("local/deep-coder", source).model).toBe("local/deep-coder");
    expect(localCodingEnv("Deep", source).model).toBe("local/deep-coder");
    expect(localCodingEnv("unknown", source).model).toBe("local/fast-coder");
  });

  it("never falls back to the deployment's main key", () => {
    expect(localCodingEnv("", { ...source, ARGO_LOCAL_CODING_KEY: "" })).toEqual({ env: {} });
    expect(localCodingEnv("", { ...source, ARGO_LOCAL_CODING_MODELS: "" })).toEqual({ env: {} });
  });
});
