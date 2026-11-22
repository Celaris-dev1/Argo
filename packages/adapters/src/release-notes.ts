import type { RunTrigger } from "@argo/contracts";

/**
 * What changed in the latest release. Bots pass it on once per user, in their next reply.
 * To announce a release, replace this entry: a new version is shown again to everyone.
 */
export const RELEASE_NOTES = {
  version: "2026-11-22.2",
  /** Accounts created after this already met these features in onboarding. */
  date: "2026-11-22T00:00:00Z",
  highlights: [
    "/Overnight: hand a bot a goal before bed and wake up to a report",
    "/Watch: a bot keeps an eye on a page or repo and tells you when it changes",
    "/Debate: bots on different models in a group argue it out and agree on one answer",
    "letting other people's bots hire your bot from its public page, with your approval",
    "publishing a website you build to a live link in one step",
    "a monthly spend limit for each bot that pays from your wallet",
    "a public profile page for a bot that visitors can copy if you allow it",
    "uncensored models you can pick, such as DeepSeek V4.1 Abliterated, GLM 5.3 Uncensored and Kimi K3.1 Pro",
    "Inkling 2 Mini, a new reasoning model",
    "a refreshed look across the site",
    "Deep Research: /Research gives a cited report you can share or download",
    "free GPT-6 Astra coding, 7M tokens a day on the free plan",
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
