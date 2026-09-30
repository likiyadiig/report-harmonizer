# Report Harmonizer

A consultant uploads a Word report written by several people. They get it back in one voice, as tracked changes, with comments on any edit that might change the meaning.

That is the goal. Only part of it is built so far (see Status).

## Stack

| Part | Package | Version |
| --- | --- | --- |
| Web framework | next | 16.3.7 |
| UI | react, react-dom | 19.2.8 |
| Language | typescript | ^5 |
| Styling | tailwindcss, @tailwindcss/postcss | ^4 |
| Database access | prisma, @prisma/client, @prisma/adapter-pg | 7.10.0 |
| Sign-in | better-auth | 1.7.6 |
| Reading .docx files | jszip | 3.10.1 |
| Parsing XML | saxes | 6.0.0 |
| Tests | vitest | 5.0.3 |

The database is Postgres.

## Prerequisites

- Node 22.
- A running Postgres server with an empty database for this app.
- Python 3, only if you rebuild the parity fixtures (see Tests). The app itself never runs Python.

## Setup

```bash
git clone <repository-url>
cd report-harmonizer
npm install
cp .env.example .env
```

Fill in `.env` (see the next section). Then apply the migrations and build the database client:

```bash
npx prisma migrate deploy
npx prisma generate
```

`migrate deploy` applies the migrations already in the repo. It never creates new ones. `generate` writes the database client to `app/generated/prisma`. That folder is not in git, so you must run it after every fresh clone.

Start the app:

```bash
npm run dev
```

Open http://localhost:3000.

## Environment variables

All of them go in `.env`. That file is gitignored. Never put real values in any tracked file.

| Key | What it is for | Example format |
| --- | --- | --- |
| `DATABASE_URL` | The Postgres connection string. | `postgresql://USER:PASSWORD@localhost:5432/DATABASE` |
| `BETTER_AUTH_SECRET` | Signs sign-in sessions. Use a long random string. | `<random string, 32+ characters>` |
| `BETTER_AUTH_URL` | The address the app runs at. Sign-in links point here. | `http://localhost:3000` |
| `UPLOAD_DIR` | The folder where uploaded reports are stored. | `/var/tmp/report-harmonizer-uploads` |

`UPLOAD_DIR` must be an absolute path outside the project folder. Uploads are confidential client reports, and they must never end up in the repo. The app refuses to start an upload if the path is relative or inside the project. It creates the folder on first upload.

## Data model

The tables are:

- **User**: one row per person who signs in, keyed by email.
- **RuleSet**: the user's style rules. One per user.
- **Job**: one upload. It holds the status (queued, processing, done or failed), a copy of the rules used, the model and prompt version, counts of paragraphs and edits, token usage and timestamps. The edit counts, token usage and finish time are filled in once processing is built.
- **Session, Account, Verification**: sign-in tables the auth library needs.

The database is set up so that deleting a user also deletes their rule set, jobs and sessions. The app has no way to delete a user yet.

The schema is in `prisma/schema.prisma`. The migrations are in `prisma/migrations/`.

No report text is ever stored in the database. A job keeps only counts, timestamps, token usage and the original filename. Once file deletion is built, the filename will be cleared when the files are deleted (see Status).

## Signing in

Sign in with an email link. Email sending is not set up yet. For now the link is printed to the terminal that runs `npm run dev`. Copy it into your browser.

## Tests

```bash
npm test
```

The parity tests check that the TypeScript paragraph reader gives the same result as `prototype/read_report.py`. Each fixture folder in `tests/fixtures/parity/` holds:

- `document.xml`: the made-up document content.
- `python-output.txt`: what the Python prototype printed for it.

The test builds a .docx from `document.xml`, reads it, and compares the result with `python-output.txt`.

You only need Python when you add or change a fixture. First build the .docx files:

```bash
npm run fixture:build
```

This prints one path per fixture. The files go to your system temp folder, outside the repo. Then, for each fixture, run:

```bash
python3 prototype/read_report.py <printed path> > tests/fixtures/parity/<name>/python-output.txt
```

The fixtures are made-up text, so their Python output is safe to commit. The .docx files are not committed.

## Status

Built:

- Sign in with an email link.
- Edit and save a rule set, prefilled with the default rules.
- Upload a .docx. This creates a queued job.
- Read the report's paragraphs, count them, and reject reports that are unreadable or empty.

Next, from SPEC.md:

- Send the paragraphs to the Claude API with the user's rules.
- Write the edits back into the same .docx as tracked changes under the author "Report Harmonizer".
- Add a comment on each edit flagged as a possible meaning change.
- Show progress, then the result to download with a summary of edits, flagged and skipped.
- Delete the uploaded and generated files once the result is downloaded, or after 24 hours at most.
