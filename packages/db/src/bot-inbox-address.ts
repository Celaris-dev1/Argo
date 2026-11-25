import { randomBytes } from "node:crypto";

/** A readable, unguessable local part: the bot's name plus 10 random characters. */
export function newInboxAddress(botName: string): string {
  const slug = botName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const random = randomBytes(8)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${slug || "bot"}-${random.slice(0, 10)}`;
}
