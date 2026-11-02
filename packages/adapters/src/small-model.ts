import { BUILTIN_TOOL_NAMES } from "@rakazo/contracts";
import { LOCAL_PROVIDER_ID } from "./pi-local-provider.js";

/**
 * Small-model mode. 1–3B models (and many uncensored fine-tunes without a strong tool
 * template) fall apart when offered ~90 tools and a long system prompt. For models named in
 * RAKAZO_SMALL_MODELS, offer only a core tool set so the whole prompt fits a small context
 * window and the model picks the right tool more often.
 *
 *   RAKAZO_SMALL_MODELS=local                 every model on the local server
 *   RAKAZO_SMALL_MODELS=qwen3:1.7b,gemma3:1b   exact model ids (any provider)
 *   RAKAZO_SMALL_MODEL_TOOLS=shell,web_search  replace the default core set
 */
export const DEFAULT_SMALL_MODEL_TOOLS = [
  "shell",
  "list_files",
  "read_file",
  "write_file",
  "edit_file",
  "attach_file",
  "web_search",
  "web_fetch",
  "browser_navigate",
  "browser_snapshot",
  "browser_act",
  "ask_user",
  "message_user",
  "request_secret",
  "save_memory",
  "recall_memory",
  "remember",
  "schedule_create",
  "schedule_list",
  "schedule_cancel",
] as const;

function csv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isSmallModel(
  provider: string | undefined,
  modelId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const names = csv(env.RAKAZO_SMALL_MODELS);
  if (!names.length || !modelId) return false;
  if (names.includes("local") && provider === LOCAL_PROVIDER_ID) return true;
  return names.includes(modelId) || names.includes(`${provider}/${modelId}`);
}

/** Built-in tools to hide for this run's model, merged with the bot's own disabled list. */
export function withSmallModelDisabledTools(
  disabled: readonly string[] | undefined,
  provider: string | undefined,
  modelId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
  if (!isSmallModel(provider, modelId, env)) return disabled ? [...disabled] : undefined;
  const custom = csv(env.RAKAZO_SMALL_MODEL_TOOLS);
  const keep = new Set<string>(custom.length ? custom : DEFAULT_SMALL_MODEL_TOOLS);
  const hidden = BUILTIN_TOOL_NAMES.filter((name) => !keep.has(name));
  return [...new Set([...(disabled ?? []), ...hidden])];
}
