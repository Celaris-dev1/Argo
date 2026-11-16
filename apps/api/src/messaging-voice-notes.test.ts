import { describe, expect, it, vi } from "vitest";
import { transcribeVoiceNotes } from "./messaging-inbound.js";

const ids = { spaceId: "space", userId: "user", botId: "bot" };

describe("transcribeVoiceNotes", () => {
  it("turns audio attachments into text lines and skips other files", async () => {
    const transcribeAudio = vi.fn(async () => "  call the bank tomorrow ");
    const lines = await transcribeVoiceNotes({ transcribeAudio }, ids, [
      { id: "a1", mimeType: "audio/ogg" },
      { id: "p1", mimeType: "image/png" },
    ]);
    expect(lines).toEqual(["[voice note] call the bank tomorrow"]);
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
    expect(transcribeAudio).toHaveBeenCalledWith({ ...ids, artifactId: "a1" });
  });

  it("keeps the note as a file when nothing transcribes it", async () => {
    expect(await transcribeVoiceNotes({}, ids, [{ id: "a1", mimeType: "audio/ogg" }])).toEqual([]);
    expect(
      await transcribeVoiceNotes({ transcribeAudio: async () => null }, ids, [
        { id: "a1", mimeType: "audio/ogg" },
      ]),
    ).toEqual([]);
  });

  it("does not drop the message when transcription fails", async () => {
    const lines = await transcribeVoiceNotes(
      {
        transcribeAudio: async () => {
          throw new Error("provider down");
        },
      },
      ids,
      [{ id: "a1", mimeType: "audio/ogg" }],
    );
    expect(lines).toEqual([]);
  });
});
