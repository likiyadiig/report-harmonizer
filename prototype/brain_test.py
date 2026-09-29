import sys, json, zipfile, re, html
import anthropic

# Which file and which paragraph number to test
path, num = sys.argv[1], int(sys.argv[2])

# Read that one paragraph (same method as the reader)
with zipfile.ZipFile(path) as z:
    xml = z.read('word/document.xml').decode('utf8')
paragraphs = re.findall(r'<w:p[ >].*?</w:p>', xml, flags=re.S)
text = html.unescape(''.join(re.findall(r'<w:t(?: [^>]*)?>([^<]*)</w:t>', paragraphs[num])))
print("ORIGINAL:\n" + text + "\n")

# The rules Claude must follow (your mom's rules are in here)
RULES = """You edit paragraphs from a report written by several authors so it reads as one voice.

Rules:
- Keep every fact, number, name, finding, quote and claim exactly as it is.
- Never change text inside quotation marks.
- Do not add or remove information. Keep hedges like "suggests" or "may".
- Use plain sentences. Split very long sentences, but don't make the text choppy.
- Never add colons (:) or dashes (- used as punctuation, or –, —). Where the original
  uses them as punctuation, rewrite without them if the meaning stays the same.
  Hyphens inside words (like "sub-national") and number ranges (like 21–22) are fine.
- If the text is already fine, return no edits.

Return ONLY JSON, no other text, in this format:
{"edits": [{"old": "exact text copied from the paragraph",
            "new": "replacement text",
            "risk": "none" or "possible",
            "note": "short reason"}]}

Each "old" must be copied exactly, character for character, and be as short as
possible (one sentence or less). Mark risk "possible" if you changed emphasis,
certainty, tense or a cause-and-effect link, even slightly."""

client = anthropic.Anthropic()  # reads your API key automatically
msg = client.messages.create(
    model="claude-sonnet-5",
    max_tokens=2000,
    system=RULES,
    messages=[{"role": "user", "content": text}],
)

# Clean up and read Claude's answer
answer = "".join(b.text for b in msg.content if b.type == "text")
answer = answer.strip().removeprefix("```json").removesuffix("```").strip()
edits = json.loads(answer)["edits"]

for e in edits:
    print("OLD: ", e["old"])
    print("NEW: ", e["new"])
    print("RISK:", e["risk"], "|", e["note"])
    # Safety check: the old text must really be in the paragraph
    print("FOUND IN PARAGRAPH:", e["old"] in text)
    print()
