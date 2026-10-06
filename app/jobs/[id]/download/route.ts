import { readFile } from "node:fs/promises";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { contentDisposition, downloadFilename } from "@/lib/download";
import { harmonizedPath } from "@/lib/process-job";

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Sends the harmonized report to the signed-in user who owns the job.
// No session, someone else's job, a job that doesn't exist and a job
// that isn't done all get the same "not found", so the answer never shows
// whether a job exists. The file path is built from the job's id in the
// database, only after ownership is checked, never from the request.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Only an id of the right shape is logged, so a crafted URL can't write
  // anything else into the logs.
  const logId = /^[a-z0-9]+$/.test(id) ? id : "invalid";

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return notFound(logId);

  const job = await db.job.findFirst({
    where: { id, userId: session.user.id, status: "done" },
    select: { id: true, originalFilename: true },
  });
  if (!job) return notFound(logId);

  let bytes: Buffer;
  try {
    bytes = await readFile(harmonizedPath(job.id));
  } catch (error) {
    // Deleted, or never written. The owner goes back to the job page,
    // which explains that the file is no longer there.
    const code = (error as { code?: unknown } | null)?.code;
    console.log(
      `DOWNLOAD job=${job.id} outcome=${code === "ENOENT" ? "missing_file" : "read_failed"}`,
    );
    return new Response(null, {
      status: 303,
      headers: { Location: `/jobs/${job.id}`, "Cache-Control": "no-store" },
    });
  }

  // A record only. Deleting files after download comes later.
  try {
    await db.job.update({ where: { id: job.id }, data: { downloadedAt: new Date() } });
  } catch {
    // The user still gets their file.
    console.error(`DOWNLOAD_RECORD_FAILED job=${job.id}`);
  }

  console.log(`DOWNLOAD job=${job.id} outcome=sent`);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": contentDisposition(downloadFilename(job.originalFilename)),
      "Content-Length": String(bytes.length),
      // A confidential report: no browser or proxy keeps a copy.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(logId: string): Response {
  console.log(`DOWNLOAD job=${logId} outcome=not_found`);
  return new Response("Not found.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
