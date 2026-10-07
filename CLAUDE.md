# Project
Report Harmonizer. Web app: a consultant uploads a multi-author Word
report and gets it back harmonized into one voice, as tracked changes
with comments on edits that might change the meaning.

Stack: Next.js + TypeScript, Prisma + Postgres, Tailwind. Node 22.

# Commands
npm run dev                           # dev server on http://localhost:3001
npm run build                         # production build
npm start                             # serve the production build
npx prisma migrate dev --name <name>  # apply schema changes (ask first)

# Rules
SPEC.md is the contract. Anything in the "Not in v1" list does not
get built, suggested, or stubbed. Ask me before adding a table or
field that is not in SPEC.md.

Never create a migration unless the task is explicitly about the
schema. Ask first.

Never write a real credential (API keys, database passwords) into
any tracked file. Secrets go in .env, which is gitignored.

Never commit or copy .docx files into this repo. Client reports are
confidential. The only exception is the made-up sample reports in
public/samples/, which anyone can download from the home page.

Never disable validation, type checks or tests to make an error go
away. Explain the error and ask me first.

Only change files the task is about. Do not refactor, "improve" or
fix unrelated code. Mention it instead.

For anything touching more than one file, give me a plan first and
wait for my OK.

prototype/ is a working Python reference. Port its logic to
TypeScript. Do not run or modify it.

I'm learning. Explain what you're doing and why in plain language.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
