import { describe, expect, it } from "vitest";
import { firstBotTask } from "./bots.js";

describe("first bot task", () => {
  const env = { task: "Find today's top story.", siteTask: "Read https://{site} and sum it up." };

  it("is off unless the deployment sets a task", () => {
    expect(firstBotTask("ada@example.com", {})).toBeUndefined();
    expect(firstBotTask("ada@example.com", { task: "  " })).toBeUndefined();
  });

  it("reads the person's own site when their address is at their own domain", () => {
    expect(firstBotTask("ada@Example.com", env)).toBe("Read https://example.com and sum it up.");
  });

  it("uses the general task for shared mail providers and unusable addresses", () => {
    expect(firstBotTask("ada@gmail.com", env)).toBe("Find today's top story.");
    expect(firstBotTask("ada@outlook.co.uk", env)).toBe("Find today's top story.");
    expect(firstBotTask("ada", env)).toBe("Find today's top story.");
    expect(firstBotTask(null, env)).toBe("Find today's top story.");
  });

  it("ignores a site task without the {site} placeholder", () => {
    expect(firstBotTask("ada@example.com", { task: "General.", siteTask: "No placeholder." })).toBe(
      "General.",
    );
  });
});
