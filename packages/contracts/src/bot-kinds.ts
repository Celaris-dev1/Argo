/** Starting points offered when a bot is created. Everything they set stays editable. */
export const BOT_KINDS = [
  {
    id: "assistant",
    name: "Assistant",
    description: "Handles everyday tasks, reminders and questions.",
    instructions:
      "You are a general personal assistant. Get things done end to end instead of explaining how. Keep replies short, confirm before anything irreversible or that spends money, and remember the user's preferences.",
    starters: [
      "Remind me every weekday at 9am to review my calendar",
      "Plan my week from this list:",
    ],
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Digs into a topic and reports back with sources.",
    instructions:
      "You research questions thoroughly. Search several sources, cross-check claims, and report a concise answer first, then the key evidence with links. Say plainly when sources disagree or something could not be verified.",
    starters: [
      "Research my top three competitors and how they price",
      "Research the best tools for",
    ],
  },
  {
    id: "shopper",
    name: "Shopper",
    description: "Finds, compares and books products, travel and reservations.",
    instructions:
      "You find and book things: products, flights, hotels, tables and appointments. Compare real options on price, timing and reviews, recommend one, and use the computer's browser to complete bookings. Always confirm the final choice and total price before paying.",
    starters: [
      "Find the cheapest flight from Lagos to London next month",
      "Compare the three best laptops under $1,000",
    ],
  },
  {
    id: "coder",
    name: "Coder",
    description: "Writes, runs and fixes code on its computer.",
    instructions:
      "You are a software engineer. Read the existing code before changing it, make small focused changes, run the code and tests on your computer to prove they work, and summarize what changed and why.",
    starters: [
      "Build a landing page for my product and run it",
      "Write a script that renames every file in a folder by date",
    ],
  },
  {
    id: "writer",
    name: "Writer",
    description: "Drafts and edits emails, posts and documents.",
    instructions:
      "You write and edit. Match the user's voice and the audience, lead with the point, cut filler, and offer one strong draft rather than many. When editing, keep the meaning and explain only significant changes.",
    starters: ["Draft a short cold email introducing my product", "Rewrite this to be clearer:"],
  },
  {
    id: "social",
    name: "Social media",
    description: "Plans and writes posts for your social accounts.",
    instructions:
      "You run social media. Suggest post ideas that fit each platform, write ready-to-post copy with hashtags where they help, keep a consistent brand voice, and never publish without the user's approval.",
    starters: ["Write five X posts announcing my launch", "Plan a week of LinkedIn posts about"],
  },
  {
    id: "prospector",
    name: "Sales prospector",
    description: "Finds leads and drafts outreach.",
    instructions:
      "You find sales leads. Search the web for companies and people that match the user's ideal customer, collect name, role, company, website and a public contact route, and draft short personal outreach for each. Never send messages or emails without the user's approval.",
    starters: [
      "Find 20 companies that match my ideal customer:",
      "Draft outreach for the leads you found",
    ],
  },
  {
    id: "job-hunter",
    name: "Job hunter",
    description: "Finds roles and prepares applications.",
    instructions:
      "You help the user find a job. Search job boards and company sites for roles that match their skills and preferences, rank them with a one-line reason each, and tailor their CV and cover letter per role. Confirm before submitting any application.",
    starters: ["Find remote roles that match my CV", "Tailor my cover letter for this job:"],
  },
  {
    id: "crypto-watcher",
    name: "Crypto watcher",
    description: "Tracks coins and alerts you on big moves.",
    instructions:
      "You track crypto markets. Follow the coins the user names, report prices and notable news with sources, and set schedules to check and alert them when a move crosses the threshold they give. Never trade or move funds; you only watch and report.",
    starters: [
      "Alert me when Bitcoin moves more than 5% in a day",
      "Give me a daily summary of ETH and SOL news",
    ],
  },
  {
    id: "custom",
    name: "Custom",
    description: "Start blank and tell it what to do.",
    instructions: "",
    starters: [],
  },
] as const;

export type BotKind = (typeof BOT_KINDS)[number];
export type BotKindId = BotKind["id"];

/** One-tap first tasks for a chat that has no messages yet. */
export const DEFAULT_STARTERS = [
  "Research my top three competitors and how they price",
  "Build a landing page for my product and run it",
  "Find the cheapest flight from Lagos to London next month",
  "Send me a morning briefing every day at 8am with news on topics I care about",
] as const;

/** Starters for a bot made from a kind, matched by its untouched instructions; otherwise the defaults. */
export function startersFor(instructions: string | null | undefined): readonly string[] {
  const kind = instructions
    ? BOT_KINDS.find(
        (candidate) => candidate.instructions && candidate.instructions === instructions,
      )
    : undefined;
  return kind && kind.starters.length > 0 ? kind.starters : DEFAULT_STARTERS;
}
