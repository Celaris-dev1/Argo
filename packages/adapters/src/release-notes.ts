import type { RunTrigger } from "@argo/contracts";

/**
 * What changed in the latest release. Bots pass it on once per user, in their next reply.
 * To announce a release, replace this entry: a new version is shown again to everyone.
 */
export const RELEASE_NOTES = {
  version: "2026-11-16",
  /** Accounts created after this already met these features in onboarding. */
  date: "2026-11-16T00:00:00Z",
  highlights: [
    "Deep Research: /Research gives a cited report you can share or download",
    "free GPT-6 Astra coding, 7M tokens a day on the free plan",
    "bot templates such as Job hunter and Sales prospector",
    "starter tasks on a new chat",
    "a daily morning briefing",
    "voice notes on Telegram and WhatsApp",
    "a public status page for a bot",
    "referrals: invite a friend and you both get bonus tokens",
  ],
  community: "https://discord.gg/m9uP9SVwD7",
} as const;

type ReleaseNotes = {
  version: string;
  date: string;
  highlights: readonly string[];
  community: string;
};

/** The one-time instruction for this run, or undefined when the user has nothing new to hear. */
export function releaseAnnouncement(
  input: {
    trigger: RunTrigger;
    announcedRelease: string | null | undefined;
    userCreatedAt: Date | undefined;
  },
  notes: ReleaseNotes = RELEASE_NOTES,
): string | undefined {
  if (input.trigger !== "user") return undefined;
  if (input.announcedRelease === notes.version) return undefined;
  if (!input.userCreatedAt || input.userCreatedAt.getTime() >= Date.parse(notes.date))
    return undefined;
  return `After fully answering the user's request, add one short, friendly line at the end telling them what you can do now that is new, picking only what fits them from: ${notes.highlights.join("; ")}. Invite them to the community at ${notes.community}. Do this once, in this reply only, and never let it replace or shorten the answer.`;
}
