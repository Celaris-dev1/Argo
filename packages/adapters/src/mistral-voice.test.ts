import { afterEach, describe, expect, it, vi } from "vitest";
import { MistralVoiceProvider } from "./mistral-voice.js";

const ctx = {
  operationId: "voice",
  traceId: "voice",
  spaceId: "w",
  userId: "u",
  signal: new AbortController().signal,
};

afterEach(() => vi.unstubAllGlobals());

describe("MistralVoiceProvider", () => {
  it("lists preset voices by slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              { name: "Jane - Neutral", slug: "gb_jane_neutral", languages: ["en_us"] },
              { name: "No slug" },
            ],
          }),
        ),
      ),
    );
    const voices = await new MistralVoiceProvider().listVoices("sk-test", ctx);
    expect(voices).toEqual([
      { id: "gb_jane_neutral", label: "Jane - Neutral", description: "en_us" },
    ]);
  });

  it("speaks with the voice and decodes the base64 audio", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ audio_data: Buffer.from([7, 8, 9]).toString("base64") })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const clip = await new MistralVoiceProvider().synthesize(
      { text: "Hi", voiceId: "gb_jane_neutral", apiKey: "sk-test" },
      ctx,
    );
    expect([...clip.bytes]).toEqual([7, 8, 9]);
    expect(clip.mimeType).toBe("audio/mpeg");
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://api.mistral.ai/v1/audio/speech");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body)).toEqual({
      model: "voxtral-mini-tts-3",
      input: "Hi",
      voice: "gb_jane_neutral",
      response_format: "mp3",
    });
  });

  it("fails clearly when no audio comes back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await expect(
      new MistralVoiceProvider().synthesize(
        { text: "Hi", voiceId: "gb_jane_neutral", apiKey: "sk-test" },
        ctx,
      ),
    ).rejects.toThrow("Mistral returned no audio.");
  });
});
