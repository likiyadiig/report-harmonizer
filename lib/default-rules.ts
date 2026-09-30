// The editable style rules a user starts with before saving their own.
// The fixed safety rules (never change facts, numbers, names or quotes)
// are not part of this text.
export const DEFAULT_RULES = `- Use short, plain sentences, but don't make the text choppy.
- Never add colons or dashes used as punctuation. Where the original uses them, rewrite without them if the meaning stays the same. Hyphens inside words and number ranges are fine.
- Avoid phrases that sound AI-written.
- If a sentence is already fine, leave it unchanged.`;

export const MAX_RULES_LENGTH = 5000;
