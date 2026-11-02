import type { MessageBlock } from "@rakazo/contracts";

/**
 * Reasoning distills and many uncensored/local fine-tunes (DeepSeek-R1 distills, QwQ, some
 * Qwen3 and Hermes builds) put their chain of thought in the reply text as <think>…</think>
 * instead of a separate reasoning field. Drop it from what the user sees. An unclosed tag at
 * the start (the model ran out of tokens mid-thought) drops everything after it.
 */
const CLOSED = /<(think|thinking|reasoning)>[\s\S]*?<\/\1>\s*/gi;
const LEADING_UNCLOSED = /^\s*<(think|thinking|reasoning)>[\s\S]*$/i;
/** Some templates emit only the closing tag, with the thought before it. */
const ORPHAN_CLOSE = /^[\s\S]*?<\/(think|thinking|reasoning)>\s*/i;

export function stripReasoningTags(text: string): string {
  if (!/<\/?(think|thinking|reasoning)>/i.test(text)) return text;
  let result = text.replace(CLOSED, "");
  if (LEADING_UNCLOSED.test(result)) return "";
  if (/<\/(think|thinking|reasoning)>/i.test(result)) result = result.replace(ORPHAN_CLOSE, "");
  return result.trim();
}

export function stripReasoningFromReply(
  assembled: string,
  blocks: MessageBlock[],
): { assembled: string; blocks: MessageBlock[] } {
  return {
    assembled: stripReasoningTags(assembled),
    blocks: blocks
      .map((block) =>
        block.kind === "text" ? { ...block, text: stripReasoningTags(block.text) } : block,
      )
      .filter((block) => block.kind !== "text" || block.text.length > 0),
  };
}
