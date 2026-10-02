import os from "node:os";
import path from "node:path";

// Recorded on each Job so we know which model and prompt produced it.
export const MODEL = "claude-sonnet-5";
export const PROMPT_VERSION = "v1";

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
