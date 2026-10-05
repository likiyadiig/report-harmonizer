import { db } from "@/lib/db";

export const INTERRUPTED_MESSAGE = "Interrupted, please upload again.";

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
