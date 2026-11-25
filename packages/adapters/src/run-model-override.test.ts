import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.PI_DEFAULT_PROVIDER = "local";
  process.env.PI_DEFAULT_MODEL = "current-model";
  process.env.ARGO_LOCAL_MODELS = "current-model,picked-model";
  process.env.ARGO_LOCAL_MODELS_URL = "http://127.0.0.1:9/v1";
});

vi.mock("./model-roles.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model-roles.js")>()),
  resolveMemberMainModel: async () => null,
}));
vi.mock("./model-selection.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model-selection.js")>()),
  findConnectedModelCredential: async () => null,
}));

const { resolveRunModel } = await import("./run-model.js");

let botModel: { modelProvider: string | null; modelId: string | null; thinkingLevel: null };

function deps() {
  return {
    deploymentModelConfigured: true,
    billingEnabled: false,
    prisma: {
      bot: { findFirst: async () => botModel },
      deploymentSettings: { findUnique: async () => null },
    },
  } as never;
}

const scope = { userId: "user", spaceId: "space", botId: "bot" };

describe("bot model overrides", () => {
  beforeEach(() => {
    botModel = { modelProvider: null, modelId: null, thinkingLevel: null };
  });

  it("follows the deployment default when the bot has no model of its own", async () => {
    await expect(resolveRunModel(deps(), scope)).resolves.toMatchObject({
      provider: "local",
      id: "current-model",
    });
  });

  it("falls back to the default when the deployment stopped offering the bot's model", async () => {
    botModel = { modelProvider: "local", modelId: "retired-model", thinkingLevel: null };
    await expect(resolveRunModel(deps(), scope)).resolves.toMatchObject({
      provider: "local",
      id: "current-model",
    });
  });

  it("keeps a saved model the deployment still offers", async () => {
    botModel = { modelProvider: "local", modelId: "picked-model", thinkingLevel: null };
    await expect(resolveRunModel(deps(), scope)).resolves.toMatchObject({ id: "picked-model" });
  });
});
