/** UI preset only; saved connections use the OpenAI-compatible provider. */
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1";

export function isOllamaCloudBaseUrl(baseUrl: string | undefined): boolean {
	try {
		return (
			normalizeOpenAiCompatibleBaseUrl(baseUrl ?? "") === OLLAMA_CLOUD_BASE_URL
		);
	} catch {
		return false;
	}
}

/**
 * One-tap presets for OpenAI-compatible servers. They are UI shortcuts only: each saves as an
 * ordinary OpenAI-compatible connection, so any other server still works by pasting its URL.
 * Local presets point at the Docker host; outside Docker use 127.0.0.1 instead.
 */
export type OpenAiCompatiblePreset = {
	id: string;
	name: string;
	baseUrl: string;
	/** Hosted services need a key; local servers do not. */
	needsKey: boolean;
	local: boolean;
};

export const OPENAI_COMPATIBLE_PRESETS: readonly OpenAiCompatiblePreset[] = [
	{
		id: "ollama-cloud",
		name: "Ollama Cloud",
		baseUrl: OLLAMA_CLOUD_BASE_URL,
		needsKey: true,
		local: false,
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		needsKey: true,
		local: false,
	},
	{
		id: "venice",
		name: "Venice",
		baseUrl: "https://api.venice.ai/api/v1",
		needsKey: true,
		local: false,
	},
	{
		id: "featherless",
		name: "Featherless",
		baseUrl: "https://api.featherless.ai/v1",
		needsKey: true,
		local: false,
	},
	{
		id: "nanogpt",
		name: "NanoGPT",
		baseUrl: "https://nano-gpt.com/api/v1",
		needsKey: true,
		local: false,
	},
	{
		id: "together",
		name: "Together AI",
		baseUrl: "https://api.together.xyz/v1",
		needsKey: true,
		local: false,
	},
	{
		id: "deepinfra",
		name: "DeepInfra",
		baseUrl: "https://api.deepinfra.com/v1/openai",
		needsKey: true,
		local: false,
	},
	{
		id: "ollama-stack",
		name: "Ollama (lite stack)",
		baseUrl: "http://ollama:11434/v1",
		needsKey: false,
		local: true,
	},
	{
		id: "ollama",
		name: "Ollama (this machine)",
		baseUrl: "http://host.docker.internal:11434/v1",
		needsKey: false,
		local: true,
	},
	{
		id: "llamacpp",
		name: "llama.cpp (this machine)",
		baseUrl: "http://host.docker.internal:8080/v1",
		needsKey: false,
		local: true,
	},
	{
		id: "lmstudio",
		name: "LM Studio (this machine)",
		baseUrl: "http://host.docker.internal:1234/v1",
		needsKey: false,
		local: true,
	},
	{
		id: "koboldcpp",
		name: "KoboldCpp (this machine)",
		baseUrl: "http://host.docker.internal:5001/v1",
		needsKey: false,
		local: true,
	},
];

function normalizedOrNull(baseUrl: string | undefined): string | null {
	try {
		return normalizeOpenAiCompatibleBaseUrl(baseUrl ?? "");
	} catch {
		return null;
	}
}

export function compatiblePresetFor(
	baseUrl: string | undefined,
): OpenAiCompatiblePreset | undefined {
	const normalized = normalizedOrNull(baseUrl);
	if (!normalized) return undefined;
	return OPENAI_COMPATIBLE_PRESETS.find(
		(preset) => normalizeOpenAiCompatibleBaseUrl(preset.baseUrl) === normalized,
	);
}

export function compatiblePresetNeedsKey(baseUrl: string | undefined): boolean {
	return compatiblePresetFor(baseUrl)?.needsKey ?? false;
}

export function compatibleConnectionName(
	baseUrl: string | undefined,
	fallback: string,
): string {
	return compatiblePresetFor(baseUrl)?.name ?? fallback;
}

export const OPENAI_COMPATIBLE_BASE_URL_HINT =
	"Paste the OpenAI-compatible address from your server. Argo adds /v1 if needed.";

/** Connect when base URL and model id are set. */
export function openAiCompatibleConnectReady(input: {
	baseUrl: string;
	modelId: string;
	apiKey?: string;
}): boolean {
	return Boolean(
		input.baseUrl.trim() &&
			input.modelId.trim() &&
			(!compatiblePresetNeedsKey(input.baseUrl) || input.apiKey?.trim()),
	);
}

export function openAiCompatibleProbeSuccessMessage(
	modelCount: number,
): string {
	return modelCount
		? `Found ${modelCount} model${modelCount === 1 ? "" : "s"}.`
		: "Server found. Enter a model name.";
}

/** The canonical endpoint the server stores: trailing slashes dropped, `/v1` added only when no
 * path segment is already a version (`v1`, `v4`, `v1beta`, ...), so gateways that route models by
 * path (`/v1/some-model`) keep their URL verbatim. */
export function normalizeOpenAiCompatibleBaseUrl(raw: string): string {
	const trimmed = raw.trim();
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error("Base URL must be an absolute HTTP(S) URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Base URL must use http or https");
	}
	if (url.username || url.password) {
		throw new Error("Base URL must not contain credentials");
	}
	let path = url.pathname.replace(/\/+$/, "") || "";
	const VERSION_SEGMENT = /^v\d+[a-z]*$/;
	if (!path.split("/").some((segment) => VERSION_SEGMENT.test(segment))) {
		path = path ? `${path}/v1` : "/v1";
	}
	return `${url.origin}${path}`;
}

/** Self-hosted voice defaults: Kokoro and Whisper as mlx-audio names them. */
export const DEFAULT_COMPATIBLE_TTS_MODEL = "mlx-community/Kokoro-82M-bf16";
export const DEFAULT_COMPATIBLE_STT_MODEL =
	"mlx-community/whisper-large-v3-turbo-asr-fp16";

/** Preferred default, explicit enabled id (preferred first), then a list-less legacy fallback.
 * Candidates must be in stable credential order, newest first.
 */
export function selectCompatibleModelCredential<
	C extends {
		defaultModel?: string | null;
		enabledModelIds?: readonly string[] | null;
	},
>(preferred: C, candidates: readonly C[], modelId: string): C | undefined {
	if (
		preferred.defaultModel === modelId ||
		preferred.enabledModelIds?.includes(modelId)
	)
		return preferred;
	return (
		candidates.find((candidate) =>
			candidate.enabledModelIds?.includes(modelId),
		) ?? (preferred.enabledModelIds === undefined ? preferred : undefined)
	);
}

/** Match a typed endpoint to the canonical saved endpoint; incomplete input never matches. */
export function savedCompatibleEndpointMatches(
	baseUrl: string,
	savedBaseUrl: string | undefined,
): boolean {
	try {
		return (
			Boolean(savedBaseUrl) &&
			normalizeOpenAiCompatibleBaseUrl(baseUrl) === savedBaseUrl
		);
	} catch {
		return false;
	}
}
