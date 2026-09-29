# Project
Report Harmonizer. Web app: a consultant uploads a multi-author Word
report and gets it back harmonized into one voice, as tracked changes
with comments on edits that might change the meaning.

Stack: Next.js + TypeScript, Prisma + Postgres, Tailwind. Node 22.

# Commands
Filled in once the skeleton exists.

# Rules
SPEC.md is the contract. Anything in the "Not in v1" list does not
get built, suggested, or stubbed. Ask me before adding a table or
field that is not in SPEC.md.

Never create a migration unless the task is explicitly about the
schema. Ask first.

Never write a real credential (API keys, database passwords) into
any tracked file. Secrets go in .env, which is gitignored.

Never commit or copy .docx files into this repo. Client reports are
confidential.

Only change files the task is about. Do not refactor, "improve" or
fix unrelated code. Mention it instead.

For anything touching more than one file, give me a plan first and
wait for my OK.

prototype/ is a working Python reference. Port its logic to
TypeScript. Do not run or modify it.

I'm learning. Explain what you're doing and why in plain language.
