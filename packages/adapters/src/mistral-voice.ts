import type {
  AdapterContext,
  AdapterDescriptor,
  SpeechClip,
  VoiceCapabilities,
  VoiceInfo,
  VoiceProvider,
  VoiceSynthesizeRequest,
  VoiceVerifyResult,
} from "@argo/adapter-kit";
import {
  readVoiceAudio,
  readVoiceJson,
  requireOk,
  verifyVoiceHttpGet,
  voiceDeadline,
  voiceRequestError,
} from "./voice-http.js";

const API = "https://api.mistral.ai/v1";
// The `-latest` alias still routes to the older speech API, which rejects preset voices.
const MODEL = "voxtral-mini-tts-3";
const VOICE_PAGE_LIMIT = 100;

export class MistralVoiceProvider implements VoiceProvider {
  describe(): AdapterDescriptor<VoiceCapabilities> {
    return {
      id: "mistral",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { catalog: true, synthesize: true, transcribe: false },
    };
  }

  async verify(apiKey: string, context: AdapterContext): Promise<VoiceVerifyResult> {
    return verifyVoiceHttpGet({
      url: `${API}/audio/voices?limit=1`,
      headers: mistralHeaders(apiKey),
      signal: context.signal,
      provider: "Mistral",
    });
  }

  async listVoices(apiKey: string, context: AdapterContext): Promise<VoiceInfo[]> {
    const res = await fetch(`${API}/audio/voices?limit=${VOICE_PAGE_LIMIT}`, {
      headers: mistralHeaders(apiKey),
      signal: voiceDeadline(context.signal, 20_000),
    });
    const body = await readVoiceJson(res, { requireValid: res.ok });
    if (!res.ok) throw voiceRequestError(res.status, "Mistral", "listing voices", body);
    const items = (body as { items?: unknown } | null)?.items;
    if (!Array.isArray(items)) return [];
    return items
      .map((voice: Record<string, unknown>) => ({
        id: String(voice.slug ?? ""),
        label: String(voice.name ?? "Voice"),
        description: Array.isArray(voice.languages) ? voice.languages.join(", ") : undefined,
      }))
      .filter((voice) => voice.id);
  }

  async synthesize(request: VoiceSynthesizeRequest, context: AdapterContext): Promise<SpeechClip> {
    const signal = voiceDeadline(request.signal ?? context.signal, 60_000);
    const res = await fetch(`${API}/audio/speech`, {
      method: "POST",
      headers: { ...mistralHeaders(request.apiKey), "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        input: request.text,
        voice: request.voiceId,
        response_format: "mp3",
      }),
      signal,
    });
    await requireOk(res, "Mistral", "speaking");
    // The audio comes back base64-encoded inside JSON, so read it with the audio cap.
    const raw = new TextDecoder().decode(await readVoiceAudio(res, signal));
    let audio: unknown;
    try {
      audio = (JSON.parse(raw) as { audio_data?: unknown }).audio_data;
    } catch {
      audio = undefined;
    }
    if (typeof audio !== "string" || !audio) throw new Error("Mistral returned no audio.");
    return { bytes: new Uint8Array(Buffer.from(audio, "base64")), mimeType: "audio/mpeg" };
  }
}

function mistralHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}
