import { db } from "@/lib/db";
import { JOB_TIMEOUT_MS } from "@/lib/config";

export const INTERRUPTED_MESSAGE = "Interrupted, please upload again.";
export const TOO_LONG_MESSAGE = "This took too long. Please upload again.";

// A job runs inside the server process. If the server stopped while a job
// was running or about to start (a restart, an update, a crash), that job
// would stay at "processing" or "queued" forever. Run once at startup,
// before the server takes any upload, so every unfinished job found here
// is left over from before. It marks them failed so the user knows to
// upload again.
export async function failInterruptedJobs(): Promise<number> {
  const { count } = await db.job.updateMany({
    where: { status: { in: ["queued", "processing"] } },
    data: { status: "failed", error: INTERRUPTED_MESSAGE, finishedAt: new Date() },
  });
  return count;
}

// A job starts right after upload and stops itself after JOB_TIMEOUT_MS.
// The margin leaves time to save the result after that. A job still
// unfinished after this was cut off without being marked failed, for
// example by a brief database error, and nothing will ever finish it.
export const STUCK_AFTER_MS = JOB_TIMEOUT_MS + 5 * 60_000;

// There is no "started at" field, so the upload time stands in for it.
export function isStuck(
  job: { status: string; createdAt: Date },
  now: Date = new Date(),
): boolean {
  return (
    (job.status === "queued" || job.status === "processing") &&
    now.getTime() - job.createdAt.getTime() > STUCK_AFTER_MS
  );
}

// Marks a stuck job failed. Only a job still queued or processing is
// changed, so a job that finished in the meantime keeps its result.
export async function failStuckJob(jobId: string): Promise<void> {
  await db.job.updateMany({
    where: { id: jobId, status: { in: ["queued", "processing"] } },
    data: { status: "failed", error: TOO_LONG_MESSAGE, finishedAt: new Date() },
  });
}
