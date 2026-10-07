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
| Claude API | @anthropic-ai/sdk | 0.131.0 |
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

Open http://localhost:3001.

The dev server uses port 3001 so it can run on the same machine as the production server, which uses port 3000. To run in production, see Deploying.

## Environment variables

In development, all of them go in `.env`. That file is gitignored. In production, they go in an env file outside the project folder instead (see Deploying). Never put real values in any tracked file.

| Key | What it is for | Example format |
| --- | --- | --- |
| `DATABASE_URL` | The Postgres connection string. | `postgresql://USER:PASSWORD@localhost:5432/DATABASE` |
| `BETTER_AUTH_SECRET` | Signs sign-in sessions. Use a long random string. | `<random string, 32+ characters>` |
| `BETTER_AUTH_URL` | The address the app runs at. Sign-in links point here. | `http://localhost:3001` in development, `https://harmonizer.example.com` in production |
| `UPLOAD_DIR` | The folder where uploaded reports are stored. | `/var/lib/report-harmonizer/uploads` |
| `EMAIL_API_KEY` | The Resend API key that sends sign-in emails. | `re_<random characters>` |
| `EMAIL_FROM` | Who sign-in emails come from. Use the name "Report Harmonizer" and an address on a domain verified in Resend. | `Report Harmonizer <signin@yourdomain.com>` |
| `ALLOWED_EMAILS` | The email addresses allowed to sign in, separated by commas. Case and spaces are ignored. | `you@example.com, colleague@example.com` |
| `ANTHROPIC_API_KEY` | The Claude API key that harmonizes reports. Get it from the Anthropic Console. | `sk-ant-<random characters>` |

`UPLOAD_DIR` must be an absolute path outside the project folder. Uploads are confidential client reports, and they must never end up in the repo. The server refuses to start if the path is relative or inside the project. It creates the folder on first upload.

In development, you can leave `UPLOAD_DIR` empty. Uploads then go to `report-harmonizer-uploads` in your system temp folder (on Linux, `/tmp/report-harmonizer-uploads`), and the server prints that path when it starts. In production, `UPLOAD_DIR` is required. The server refuses to start if it is missing.

`BETTER_AUTH_URL` is required in production and must start with `https://`. The server refuses to start otherwise. Sign-in links carry a sign-in token, so they must use https. Without this setting, the auth library would build the link from the address in the incoming request, which anyone can fake, so a sign-in email could point to someone else's site. In development, `http://localhost:3001` is fine.

In development, use a separate Resend API key made for development. Never put the production key in your local `.env`. You can also leave `EMAIL_API_KEY` empty and get sign-in links in the terminal (see Signing in). If you set `EMAIL_API_KEY`, you must set `EMAIL_FROM` too.

In production, both are required. The server refuses to start if either is missing.

`ALLOWED_EMAILS` is required in production too. The server refuses to start if it is missing or empty. In development, an empty `ALLOWED_EMAILS` lets any address sign in, and the server prints a warning when it starts. `npm run dev` listens on localhost only, so nobody else can reach that server. An entry that is not a single email address, for example addresses separated by semicolons, stops the server in every environment.

`ANTHROPIC_API_KEY` is required in production. The server refuses to start if it is missing. In development, use a separate key made for development, never the production one. You can also leave it empty: the server prints a warning when it starts, and uploaded reports fail with "The server isn't set up to harmonize reports yet" instead of being sent to Claude.

## Deploying

These steps run the app on one Linux server (Ubuntu or Debian) with Node 22, Postgres, nginx and certbot installed. The app runs as a systemd service on 127.0.0.1 port 3000, and nginx in front of it handles https.

In the commands below, replace:

- `<user>` with the Linux user the app runs as. Use a normal user, not root.
- `harmonizer.example.com` with your domain.
- `<repository-url>` with the address of this repository.

### First-time setup

1. Create a Postgres user and database for the app. The first command asks for a password. Make one with `openssl rand -hex 32`.

   ```bash
   sudo -u postgres createuser --pwprompt report_harmonizer
   sudo -u postgres createdb --owner report_harmonizer report_harmonizer
   ```

2. Create the env file at `/etc/report-harmonizer/env`. This is where the production settings live, outside the project folder:

   ```bash
   sudo mkdir -p /etc/report-harmonizer
   sudo touch /etc/report-harmonizer/env
   sudo chown <user>:<user> /etc/report-harmonizer/env
   sudo chmod 600 /etc/report-harmonizer/env
   ```

   `chmod 600` means only `<user>` (and root) can read the file, because it holds your secrets. Open it in an editor and fill in all the variables (see Environment variables):

   ```bash
   DATABASE_URL="postgresql://report_harmonizer:PASSWORD@localhost:5432/report_harmonizer"
   BETTER_AUTH_SECRET="<output of openssl rand -hex 32>"
   BETTER_AUTH_URL="https://harmonizer.example.com"
   UPLOAD_DIR="/var/lib/report-harmonizer/uploads"
   EMAIL_API_KEY="re_<random characters>"
   EMAIL_FROM="Report Harmonizer <signin@yourdomain.com>"
   ALLOWED_EMAILS="you@example.com, colleague@example.com"
   ANTHROPIC_API_KEY="sk-ant-<random characters>"
   ```

   Put every value in double quotes. Two programs read this file: systemd, and your shell when you build (step 6). Without quotes, the shell would trip over the spaces and the `<` in `EMAIL_FROM`. Don't use `$`, `` ` ``, `"` or `\` inside a value, because the shell and systemd read those differently. Secrets made with `openssl rand -hex 32` only use 0-9 and a-f, so they're always safe.

3. Clone the app into `/var/www/report-harmonizer`:

   ```bash
   sudo mkdir -p /var/www/report-harmonizer
   sudo chown <user>:<user> /var/www/report-harmonizer
   git clone <repository-url> /var/www/report-harmonizer
   ```

   Don't put a `.env` file in this folder. In production, every setting comes from `/etc/report-harmonizer/env`.

4. Create the upload folder. It is outside the project folder, so a client report can never end up in the repo:

   ```bash
   sudo mkdir -p /var/lib/report-harmonizer/uploads
   sudo chown -R <user>:<user> /var/lib/report-harmonizer
   chmod 700 /var/lib/report-harmonizer/uploads
   ```

   `chmod 700` means only `<user>` can open the folder.

5. Install the packages:

   ```bash
   cd /var/www/report-harmonizer
   npm ci
   ```

   `npm ci` installs the exact versions in `package-lock.json`, so the server gets the same packages you tested with. Don't load the env file for this step. If `NODE_ENV=production` happens to be set, npm skips the dev packages, and the build needs some of them (prisma, typescript, tailwind).

6. Apply the database migrations and build the app, with the env file loaded:

   ```bash
   cd /var/www/report-harmonizer
   ( set -a; . /etc/report-harmonizer/env; set +a; npx prisma migrate deploy && npm run build )
   ```

   `. /etc/report-harmonizer/env` reads the file, and `set -a` passes every variable in it on to the commands that follow. The parentheses run all of this in a separate shell that closes when it's done, so your secrets don't stay loaded in your terminal. `migrate deploy` applies the migrations in the repo and never creates new ones. `npm run build` first runs `prisma generate`, which writes the database client to `app/generated/prisma`, then builds the app. `DATABASE_URL` must be set at this point. Prisma checks for it while generating the client, even though it doesn't connect to the database.

7. Create the systemd service at `/etc/systemd/system/report-harmonizer.service`:

   ```ini
   [Unit]
   Description=Report Harmonizer
   After=network.target postgresql.service
   Wants=postgresql.service

   [Service]
   Type=simple
   User=<user>
   WorkingDirectory=/var/www/report-harmonizer
   EnvironmentFile=/etc/report-harmonizer/env
   ExecStart=/usr/bin/npm run start
   Restart=always
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

   Check where npm is with `which npm`, and fix the `ExecStart` path if it's different. `npm start` sets production mode itself and listens on 127.0.0.1 port 3000 only, so it can't be reached from other machines. Start the service, and have it start again after every reboot:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now report-harmonizer
   sudo systemctl status report-harmonizer
   ```

   If it doesn't start, read the log with `journalctl -u report-harmonizer -n 50`. The server refuses to start if a required variable is missing or wrong, and the log says which one.

8. Create the nginx site at `/etc/nginx/sites-available/harmonizer.example.com`:

   ```nginx
   server {
       listen 80;
       listen [::]:80;
       server_name harmonizer.example.com;

       client_max_body_size 27m;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   - `client_max_body_size 27m`: nginx refuses uploads over 1 MB by default. Reports can be up to 25 MB, plus some room for the form around the file.
   - `Host`: passes on the domain the browser asked for. The app needs it. Forms check that the request came from the same site, and refuse it otherwise.
   - `X-Forwarded-Proto`: tells the app the visitor used https.
   - `X-Real-IP`, `X-Forwarded-For`: pass on the visitor's real IP address instead of 127.0.0.1.

   Turn the site on, check the config and reload nginx:

   ```bash
   sudo ln -s /etc/nginx/sites-available/harmonizer.example.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

9. Get an https certificate. First, point your domain's DNS record at the server. Then run:

   ```bash
   sudo certbot --nginx -d harmonizer.example.com
   ```

   certbot gets the certificate, adds https to the nginx site, and sends http visitors to https. It renews the certificate automatically. Open https://harmonizer.example.com and sign in.

### Updating

```bash
cd /var/www/report-harmonizer
git pull
npm ci
( set -a; . /etc/report-harmonizer/env; set +a; npx prisma migrate deploy && npm run build )
sudo systemctl restart report-harmonizer
```

`prisma migrate deploy` only does something when the pull brought new migrations. Otherwise it changes nothing, so it's safe to always run it.

The site may show errors from `npm ci` until the restart finishes, usually a minute or two. If the build fails, fix it and build again before you restart.

A restart stops any report that is being harmonized or waiting to start. When the server starts again, it marks those jobs (status queued or processing) failed with "Interrupted, please upload again." The job page shows that reason. To avoid that, restart when nobody is uploading.

## Data model

The tables are:

- **User**: one row per person who signs in, keyed by email.
- **RuleSet**: the user's style rules. One per user.
- **Job**: one upload. It holds the status (queued, processing, done or failed), a copy of the rules used, the model and prompt version, counts of paragraphs and edits, token usage and timestamps. The edit counts, token usage and finish time are filled in while the report is harmonized.
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

## Harmonizing

After an upload, the server sends the report's paragraphs to the Claude API (model `claude-opus-5-5`) while the user waits on the job page. The job moves from queued to processing, then to done or failed. While it is queued or processing, the job page refreshes its status every 3 seconds by itself.

- Only paragraphs of 8 words or more are sent. Paragraphs that already have tracked changes are not sent, so the report's existing changes stay untouched. They are counted as skipped.
- Paragraphs go in batches of up to 15,000 characters, so Claude sees neighbouring paragraphs and keeps one voice.
- Claude gets fixed rules first: never change facts, numbers, names, quotes, hedges or the author's judgments, and never add colons or dashes. These are always sent, even if a user removes them from their own rules. The user's own rules follow.
- Claude returns small edits ("old text" to "new text"). An edit is skipped, and counted, if its old text isn't found exactly once in the paragraph or if it overlaps another edit.
- Claude is asked for small edits (a phrase or a sentence), each of which must read correctly with the words around it.
- An edit is flagged if Claude marks it as a possible change of meaning, if it adds, removes or swaps a word that makes the text more or less certain (maybe, might, could, possibly, appears, and similar) or that carries the author's judgment (good, bad, serious, worrying, and similar), or if it adds a colon or dash the old text didn't have. The word and punctuation checks are done by the app itself (word lists in `lib/harmonize.ts`), so they're flagged even if Claude doesn't mark them. Flagged edits get a comment in the result.

The result is saved next to the upload as `<job id>.edits.json`. For each paragraph, it holds the original text, the new text, a status (`unchanged`, `changed` or `skipped`) and the edits. This file holds report text, so it stays in `UPLOAD_DIR` and will be deleted with the upload. The database only gets counts and token usage.

### The harmonized report

Then the app writes `<job id>.harmonized.docx` to `UPLOAD_DIR` (`lib/write-tracked-changes.ts`). Every edit is a Word tracked change by "Report Harmonizer", dated when the file was written. Only the words that changed are marked. Each flagged edit gets a Word comment with a fixed sentence and Claude's note:

- possible change of meaning: "Please check whether this edit changes the meaning."
- added colon or dash: "Please check this edit. It adds a colon or dash, which your rules avoid."
- both: both sentences, then the note once.

Only the edited text changes. Formatting, styles, footnotes, tables, existing comments and every other part of the file stay as they were. An edit is skipped, and counted, if it can't be written safely:

- the paragraph already has tracked changes (including formatting changes), or its text isn't what Claude saw,
- the old text crosses a change of formatting (a bold word, say), or something sits between its runs (a bookmark, a comment mark, a footnote reference, a link edge),
- it touches a run that holds more than text (a tab, a break, a reference, a text box),
- it's inside a field result (a cross-reference, the table of contents, a page number), which Word rewrites when fields update,
- the new text has a line break, tab or invalid character.

Word sometimes splits plain text into several runs with exactly the same formatting. An edit across those is written.

The job is only marked done once the file is written. It is first written under a temporary name and renamed when complete. If writing fails, the job fails with "The edited report couldn't be saved. Please upload again." The server log line `TRACKED_CHANGES_FAILED` then gives a fixed reason code (the list is `DocxWriteReason` in `lib/write-tracked-changes.ts`), never text from the report. The summary's edit and flagged counts are the edits that are in the file. Edits the writer skipped are added to the skipped count.

### Cost limits

These limits are in `lib/config.ts`. They stop a bug or an unusual report from running up costs:

| Limit | Value |
| --- | --- |
| Text per report | 300,000 characters, about 150 pages. Checked before any call. |
| Claude calls per report | 25, retries included |
| Output per call | 16,000 tokens |
| Time per call | 2 minutes |
| Time per report | 15 minutes |
| Retries | At most one per batch, after a rate limit, server error, network error, timeout or unusable answer |

A typical 40-page report costs about $0.60. The limits cap one report at about $8.60.

### Logs

The server logs one line per event, with the job id, counts, token usage and error codes. It never logs report text, rules, Claude's answers or the API key:

```
HARMONIZE_START job=<id> paragraphs=118 skipped=2 chars=91200 batches=7
CLAUDE_CALL job=<id> call=3 paragraphs=24 in=4120 out=2890 stop=end_turn ms=18400
CLAUDE_FAILED job=<id> call=4 status=429 kind=api retry=yes
TRACKED_CHANGES job=<id> written=74 flagged=9 skipped=3 reasons=crosses_formatting:2,in_field:1 ms=410
TRACKED_CHANGES_FAILED job=<id> reason=content_types_missing
JOB_DONE job=<id> paragraphs=120 edits=74 flagged=9 skipped_edits=3 skipped_paragraphs=2 calls=8 in=28100 out=24300
JOB_FAILED job=<id> code=api_error calls=2 in=0 out=0
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

The tracked changes tests (`tests/write-tracked-changes.test.ts`) build small made-up reports in memory. For each written file they check that it is a valid .docx, that "accept all changes" gives exactly the revised text and "reject all changes" exactly the original text, and that skipped edits leave the file unchanged.

## Status

Built:

- Sign in with an email link.
- Only addresses on an allowlist can sign in.
- Edit and save a rule set, prefilled with the default rules.
- Upload a .docx. This creates a queued job.
- Read the report's paragraphs, count them, and reject reports that are unreadable or empty.
- Send the paragraphs to the Claude API with the user's rules, and save the edits (see Harmonizing).
- Write the edits back into the same .docx as tracked changes under the author "Report Harmonizer", with a comment on each flagged edit (see The harmonized report). A job is done once this file is written.
- Show progress, then the result to download with a summary of edits, flagged and skipped.
- A public home page that explains the app, with a made-up sample report before and after (`public/samples/`) that anyone can download without signing in.

Next, from SPEC.md:

- Delete the uploaded and generated files once the result is downloaded, or after 24 hours at most.
