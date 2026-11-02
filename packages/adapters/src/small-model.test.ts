import { describe, expect, it } from "vitest";
import { isSmallModel, withSmallModelDisabledTools } from "./small-model.js";

describe("small-model mode", () => {
  it("is off unless ARGO_SMALL_MODELS names the model", () => {
    expect(isSmallModel("local", "qwen3:1.7b", {})).toBe(false);
    expect(withSmallModelDisabledTools(["shell"], "local", "x", {})).toEqual(["shell"]);
  });

  it("matches every local model with the keyword local", () => {
    expect(isSmallModel("local", "gemma3:1b", { ARGO_SMALL_MODELS: "local" })).toBe(true);
    expect(isSmallModel("openai", "gpt-5", { ARGO_SMALL_MODELS: "local" })).toBe(false);
  });

  it("keeps only the core tools for a small model", () => {
    const env = { ARGO_SMALL_MODELS: "tiny" };
    const disabled = withSmallModelDisabledTools([], "openai-compatible", "tiny", env) ?? [];
    expect(disabled).not.toContain("shell");
    expect(disabled).not.toContain("web_search");
    expect(disabled).toContain("spawn_bot");
    expect(disabled).toContain("ticket_create");
  });

  it("honours a custom tool list", () => {
    const env = { ARGO_SMALL_MODELS: "tiny", ARGO_SMALL_MODEL_TOOLS: "web_search" };
    const disabled = withSmallModelDisabledTools([], "x", "tiny", env) ?? [];
    expect(disabled).toContain("shell");
    expect(disabled).not.toContain("web_search");
  });
});
