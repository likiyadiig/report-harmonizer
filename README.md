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

In production, build the app and start it:

```bash
npm run build
npm start
```

`npm run build` first runs `prisma generate`, which creates the database client in `app/generated/prisma`, then builds the app. The server doesn't need a `.env` file. Without one, the variables are read from the environment, for example from your systemd unit or hosting panel. `DATABASE_URL` must be set when you build, not only when you start. Prisma checks for it while generating the client, even though it doesn't connect to the database.

`npm start` listens on 127.0.0.1 port 3000 only, so it can't be reached from other machines. Put a reverse proxy (for example nginx or Caddy) on the same server to handle https and forward requests to it. The proxy must pass the original `Host` header through.

## Environment variables

In development, all of them go in `.env`. That file is gitignored. In production, you can set them in the environment instead (see Setup). Never put real values in any tracked file.

| Key | What it is for | Example format |
| --- | --- | --- |
| `DATABASE_URL` | The Postgres connection string. | `postgresql://USER:PASSWORD@localhost:5432/DATABASE` |
| `BETTER_AUTH_SECRET` | Signs sign-in sessions. Use a long random string. | `<random string, 32+ characters>` |
| `BETTER_AUTH_URL` | The address the app runs at. Sign-in links point here. | `http://localhost:3000` in development, `https://harmonizer.example.com` in production |
| `UPLOAD_DIR` | The folder where uploaded reports are stored. | `/var/tmp/report-harmonizer-uploads` |
| `EMAIL_API_KEY` | The Resend API key that sends sign-in emails. | `re_<random characters>` |
| `EMAIL_FROM` | Who sign-in emails come from. Use the name "Report Harmonizer" and an address on a domain verified in Resend. | `Report Harmonizer <signin@yourdomain.com>` |
| `ALLOWED_EMAILS` | The email addresses allowed to sign in, separated by commas. Case and spaces are ignored. | `you@example.com, colleague@example.com` |

`UPLOAD_DIR` must be an absolute path outside the project folder. Uploads are confidential client reports, and they must never end up in the repo. The server refuses to start if the path is relative or inside the project. It creates the folder on first upload.

In development, you can leave `UPLOAD_DIR` empty. Uploads then go to `report-harmonizer-uploads` in your system temp folder (on Linux, `/tmp/report-harmonizer-uploads`), and the server prints that path when it starts. In production, `UPLOAD_DIR` is required. The server refuses to start if it is missing.

`BETTER_AUTH_URL` is required in production and must start with `https://`. The server refuses to start otherwise. Sign-in links carry a sign-in token, so they must use https. Without this setting, the auth library would build the link from the address in the incoming request, which anyone can fake, so a sign-in email could point to someone else's site. In development, `http://localhost:3000` is fine.

In development, use a separate Resend API key made for development. Never put the production key in your local `.env`. You can also leave `EMAIL_API_KEY` empty and get sign-in links in the terminal (see Signing in). If you set `EMAIL_API_KEY`, you must set `EMAIL_FROM` too.

In production, both are required. The server refuses to start if either is missing.

`ALLOWED_EMAILS` is required in production too. The server refuses to start if it is missing or empty. In development, an empty `ALLOWED_EMAILS` lets any address sign in, and the server prints a warning when it starts. `npm run dev` listens on localhost only, so nobody else can reach that server. An entry that is not a single email address, for example addresses separated by semicolons, stops the server in every environment.

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

Sign in with an email link. The link expires after 15 minutes.

With `EMAIL_API_KEY` and `EMAIL_FROM` set, the link is emailed through Resend. Until your domain is verified in Resend, it only delivers to the email address of your own Resend account.

In development with `EMAIL_API_KEY` empty, the link is printed to the terminal that runs `npm run dev` instead. Copy it into your browser. Production never prints the link.

If sending fails, the sign-in page asks the person to try again. The server log gets one line like `EMAIL_SEND_FAILED status=403 code=validation_error`, with no link and no email address.

Only addresses in `ALLOWED_EMAILS` can sign in. Anyone else sees the same "check your email" page but gets no email, so the page doesn't reveal who is on the list. The server log gets one line, `SIGN_IN_REFUSED code=not_allowed`, with no address.

Restart the server after changing the list. Removing someone blocks new sign-ins, including a link they were sent before you removed them. It does not end a session they already have. Sessions last 7 days and renew while in use. For now, end them by hand in Postgres:

```sql
DELETE FROM "Session" WHERE "userId" = (SELECT id FROM "User" WHERE email = 'person@example.com');
```

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
- Only addresses on an allowlist can sign in.
- Edit and save a rule set, prefilled with the default rules.
- Upload a .docx. This creates a queued job.
- Read the report's paragraphs, count them, and reject reports that are unreadable or empty.

Next, from SPEC.md:

- Send the paragraphs to the Claude API with the user's rules.
- Write the edits back into the same .docx as tracked changes under the author "Report Harmonizer".
- Add a comment on each edit flagged as a possible meaning change.
- Show progress, then the result to download with a summary of edits, flagged and skipped.
- Delete the uploaded and generated files once the result is downloaded, or after 24 hours at most.
