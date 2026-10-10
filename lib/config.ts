import os from "node:os";
import path from "node:path";

// Recorded on each Job so we know which model and prompt produced it.
export const MODEL = "claude-opus-5-5";
export const PROMPT_VERSION = "v4";

// How hard Claude thinks before answering. Opus 5.5 always thinks a
// little; "low" keeps the cost down for a careful but routine edit.
export const EFFORT = "low";

// Limits that stop a bug or an unusual report from running up costs. With
// these, the most one job can cost on Opus 5.5 is about $8.60: 25 calls
// that each use all their output tokens.
export const MAX_JOB_CHARS = 300_000; // eligible text, about 150 pages
export const BATCH_MAX_CHARS = 15_000; // text sent in one call
export const MAX_CALLS_PER_JOB = 25; // retries included
export const MAX_TOKENS_PER_CALL = 16_000;
export const CALL_TIMEOUT_MS = 120_000;
export const JOB_TIMEOUT_MS = 15 * 60_000;

export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Used when UPLOAD_DIR is empty in development. It is in the system temp
// folder, so it is outside the project folder like any other UPLOAD_DIR.
export const DEV_UPLOAD_DIR = path.join(os.tmpdir(), "report-harmonizer-uploads");

// Where uploaded reports are stored. Must be outside the project folder so
// a client report can never end up in the repo. UPLOAD_DIR is required
// unless NODE_ENV is exactly "development", so a server with NODE_ENV
// missing or misspelled fails instead of using the temp folder.
export function getUploadDir(): string {
  const dir =
    process.env.UPLOAD_DIR ||
    (process.env.NODE_ENV === "development" ? DEV_UPLOAD_DIR : undefined);
  if (!dir) {
    throw new Error(
      "UPLOAD_DIR must be set to an absolute path outside the project folder.",
    );
  }
  if (!path.isAbsolute(dir)) {
    throw new Error("UPLOAD_DIR must be an absolute path.");
  }
  const resolved = path.resolve(dir);
  const relative = path.relative(process.cwd(), resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error("UPLOAD_DIR must be outside the project folder.");
  }
  return resolved;
}

// The key for the Claude API. Required unless NODE_ENV is exactly
// "development", so a server with NODE_ENV missing or misspelled fails at
// startup. In development it may be empty: the app runs, and jobs fail
// with "not set up" instead.
export function getAnthropicKey(): string | undefined {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "development") return undefined;
  throw new Error("ANTHROPIC_API_KEY must be set to harmonize reports.");
}

// Sign-in links are built from BETTER_AUTH_URL. If it is empty, the auth
// library falls back to the Host header of the request, which anyone can
// fake, so a sign-in email could point to someone else's site. Outside
// development it must be set and use https, because the link carries a
// sign-in token. In development, http://localhost:3001 is fine.
export function checkAuthUrl(): void {
  if (process.env.NODE_ENV === "development") return;
  const value = process.env.BETTER_AUTH_URL;
  let protocol: string | undefined;
  try {
    protocol = value ? new URL(value).protocol : undefined;
  } catch {}
  if (protocol !== "https:") {
    throw new Error(
      "BETTER_AUTH_URL must be set to the app's https:// address, for example https://harmonizer.example.com.",
    );
  }
}

export const MIN_AUTH_SECRET_LENGTH = 32;

// BETTER_AUTH_SECRET signs session cookies. If it is missing, the auth
// library only refuses when NODE_ENV is exactly "production"; otherwise it
// quietly uses a default secret that is printed in its public source code.
// Outside development it must be set and too long to guess. The message
// names the setting, never its value.
export function checkAuthSecret(): void {
  if (process.env.NODE_ENV === "development") return;
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be set to a random string of at least ${MIN_AUTH_SECRET_LENGTH} characters, for example the output of openssl rand -hex 32.`,
    );
  }
}

// Every page and every job needs the database. Without this check, a
// missing DATABASE_URL only shows up as server errors on each request.
// The message never includes the value: it holds the database password.
export function checkDatabaseUrl(): void {
  if (process.env.NODE_ENV === "development") return;
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error(
      "DATABASE_URL must be set to the Postgres connection string, starting with postgresql:// or postgres://.",
    );
  }
}
