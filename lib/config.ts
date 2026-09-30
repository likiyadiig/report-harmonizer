import path from "node:path";

// Recorded on each Job so we know which model and prompt produced it.
export const MODEL = "claude-sonnet-5";
export const PROMPT_VERSION = "v1";

export const MAX_UPLOAD_MB = 25;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// Where uploaded reports are stored. Must be outside the project folder so
// a client report can never end up in the repo.
export function getUploadDir(): string {
  const dir = process.env.UPLOAD_DIR;
  if (!dir) throw new Error("UPLOAD_DIR is not set.");
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
