# One line
A consultant uploads a Word report written by several people and gets
it back with the language harmonized into one voice, as tracked
changes they can accept or reject, plus comments on any edit that
might have changed the meaning.

# Who it is for
Independent evaluation and development consultants who lead
multi-author reports and spend hours or days making them sound like
one writer. They already work in Word with tracked changes.

# What it does
- Sign in with email link.
- Edit a rule set, saved to the account. Starts prefilled with a
  default (short plain sentences, no colons or dashes, never change
  facts, numbers, names or quotes).
- Upload a .docx report.
- Get back the same .docx with every edit as a tracked change under
  the author "Report Harmonizer", and a comment on each edit marked
  as a possible meaning change.
- See a short summary: number of edits, number flagged, number
  skipped.
- The report's existing tracked changes, comments and formatting are
  left untouched.

# Screens
- Sign in
- Rules (edit and save)
- Upload (choose file, see progress, download result and summary)
- Billing (/billing: the plan, its price, an Upgrade button, a link
  to the terms, and a Manage subscription button that opens Stripe's
  Customer Portal, shown once the user has a Stripe customer id)
- Terms (/terms, public: refund policy and terms of sale, linked from
  /billing and the signed out home page)

# Data model
User: id, email, name (required by the auth library, left empty),
  emailVerified, image (optional, used by the auth library, left empty),
  subscriptionStatus (free, active, past_due, canceled; default free;
  set only by the Stripe webhook), stripeCustomerId (optional, unique),
  createdAt, updatedAt
RuleSet: id, userId (one per user), body, updatedAt
Job: id, userId, status (queued, processing, done, failed),
  originalFilename (cleared when files are deleted), rulesSnapshot,
  model, promptVersion, paragraphsTotal, paragraphsDone, editsTotal,
  editsFlagged, editsSkipped, inputTokens, outputTokens, error,
  createdAt, updatedAt, finishedAt, downloadedAt, filesDeletedAt
ProcessedEvent: id, stripeEventId (unique), createdAt. One row per
  Stripe event applied, so a resent event is applied only once.
Session, Verification, Account: sign-in tables required by the auth
  library (email link sign-in).

Deleting a user deletes their rule set, jobs and sessions.
No text from a report is stored in the database.

# Privacy
Reports are confidential client documents. Uploaded and generated
files are deleted from the server as soon as the result is
downloaded, or after 24 hours at most, whether the job succeeded or
failed. The original filename is cleared at the same time.

Automatic deletion is not built yet (issue #23). Until it is, files
are kept until the user asks for them to be deleted, and /terms does
not promise automatic deletion.

To make the edits, the report's paragraphs are sent to the Claude API
(Anthropic). No report text is stored in our database: only counts
(paragraphs, edits, flagged, skipped), timestamps, token usage and
the user's own rule set.

# Not in v1
- Google Docs, PDF or pasted text. Word files only.
- Editing inside the browser. The review happens in Word.
- Team accounts. The buyer is one consultant paying for themselves.
- A library of rule sets to browse or share.
- Edits that cross formatting boundaries (footnotes, comments). These
  are skipped and counted in the summary.
- Languages other than English.

# Price
15 euros a month, with a free tier of one report, still to be tested.

# Definition of done
A consultant runs a real multi-author report through it, accepts
most of the tracked changes in Word, and says it saved them time,
without me explaining anything. First my mom, then one consultant
who isn't family.

# Stack
Next.js + TypeScript, Prisma + Postgres, Tailwind. Node 22.
The Python scripts in prototype/ are a working reference for reading
paragraphs, the Claude prompt and writing tracked changes. Port the
logic, don't run them.
