import { describe, expect, it } from "vitest";
import { releaseAnnouncement } from "./release-notes.js";

const notes = {
  version: "v2",
  date: "2026-11-16T00:00:00Z",
  highlights: ["new thing"],
  community: "https://example.com/community",
};
const existingUser = new Date("2026-11-01T00:00:00Z");

describe("releaseAnnouncement", () => {
  it("tells an existing user once about a release they have not heard", () => {
    const note = releaseAnnouncement(
      { trigger: "user", announcedRelease: null, userCreatedAt: existingUser },
      notes,
    );
    expect(note).toContain("new thing");
    expect(note).toContain("https://example.com/community");
    expect(
      releaseAnnouncement(
        { trigger: "user", announcedRelease: "v2", userCreatedAt: existingUser },
        notes,
      ),
    ).toBeUndefined();
  });

  it("skips accounts created after the release, whose onboarding already covered it", () => {
    expect(
      releaseAnnouncement(
        {
          trigger: "user",
          announcedRelease: null,
          userCreatedAt: new Date("2026-11-16T09:00:00Z"),
        },
        notes,
      ),
    ).toBeUndefined();
  });

  it("only rides on interactive replies to the owner", () => {
    for (const trigger of ["routine", "webhook", "messaging", "created", "bot_message"] as const) {
      expect(
        releaseAnnouncement(
          { trigger, announcedRelease: null, userCreatedAt: existingUser },
          notes,
        ),
      ).toBeUndefined();
    }
  });

  it("announces again when a newer release replaces the notes", () => {
    expect(
      releaseAnnouncement(
        { trigger: "user", announcedRelease: "v1", userCreatedAt: existingUser },
        notes,
      ),
    ).toBeDefined();
  });
});
