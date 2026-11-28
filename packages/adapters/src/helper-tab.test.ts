import { describe, expect, it } from "vitest";
import { HELPER_TAB_ARG } from "./browser-tools.js";
import type { ToolHost } from "./pi-runtime-tools.js";
import { withHelperTab } from "./pi-runtime-tools.js";

const host = (agentNamespace?: string) => ({ agentNamespace }) as ToolHost;

describe("withHelperTab", () => {
  it("gives a helper's page-browser calls their own tab", () => {
    const args = withHelperTab(host('["sub","a"]'), "browser_navigate", { url: "https://a.test" });
    expect(args[HELPER_TAB_ARG]).toMatch(/^helper-[a-z0-9]+$/);
    expect(args.url).toBe("https://a.test");
  });

  it("gives two helpers different tabs and one helper the same tab each call", () => {
    const a = withHelperTab(host("one"), "browser_snapshot", {})[HELPER_TAB_ARG];
    const b = withHelperTab(host("two"), "browser_snapshot", {})[HELPER_TAB_ARG];
    expect(a).not.toBe(b);
    expect(withHelperTab(host("one"), "browser_act", {})[HELPER_TAB_ARG]).toBe(a);
  });

  it("keeps the bot on its own tab and drops a tab the model supplies", () => {
    expect(withHelperTab(host(), "browser_navigate", { [HELPER_TAB_ARG]: "helper-x" })).toEqual({});
  });

  it("leaves other tools alone", () => {
    const args = { command: "ls" };
    expect(withHelperTab(host("one"), "shell", args)).toBe(args);
  });
});
