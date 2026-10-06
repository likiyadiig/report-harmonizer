import "server-only";

import { access } from "node:fs/promises";
import { harmonizedPath } from "@/lib/process-job";

// The name the harmonized report downloads as: the original name with
// " harmonized" added, e.g. "Test-report-Valdora harmonized.docx". The
// original name is kept as it was; only our added part avoids dashes.
export function downloadFilename(original: string | null): string {
  const base = (original ?? "")
    // Characters that could break the Content-Disposition header, or make
    // a browser save the file somewhere odd.
    .replace(/[\u0000-\u001F\u007F"\\/]/g, "")
    .replace(/\.docx$/i, "")
    .trim();
  return `${base || "Report"} harmonized.docx`;
}

// The Content-Disposition header for a download. Browsers that understand
// filename* use the exact name; older ones get an ASCII copy instead.
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  // encodeURIComponent leaves ' ( ) * as they are, but filename* doesn't
  // allow them unencoded.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// Whether the job's harmonized file is on disk. It can be gone if it was
// deleted, or if something went wrong after the job was marked done.
export async function harmonizedFileExists(jobId: string): Promise<boolean> {
  try {
    await access(harmonizedPath(jobId));
    return true;
  } catch {
    return false;
  }
}
