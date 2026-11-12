"use server";

import { rm } from "node:fs/promises";
import path from "node:path";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getUploadDir } from "@/lib/config";
import { db } from "@/lib/db";
import { harmonizedPath, resultPath } from "@/lib/process-job";

// Deletes a finished or failed job at its owner's request: every file it
// has on disk, then its row. Someone else's job, and a job that doesn't
// exist, get the same "not found" as the job page.
//
// A queued or processing job is refused: it is still running, and would
// write its results back to disk after the row was gone.
export async function deleteJob(jobId: string): Promise<void> {
  // Server Actions can be called directly, so check the session here too,
  // not only on the page.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const job = await db.job.findFirst({
    where: { id: jobId, userId: session.user.id },
    select: { id: true, status: true },
  });
  if (!job) notFound();
  if (job.status !== "done" && job.status !== "failed") {
    // The button isn't shown for these, so only a hand-made request gets here.
    redirect(`/jobs/${job.id}`);
  }

  // Files first, then the row. If a file can't be removed (anything other
  // than "already missing", which force: true allows), this throws and the
  // row stays, so the user can try again. Removing the row first could
  // leave a confidential file on disk that nothing points to.
  const target = harmonizedPath(job.id);
  await Promise.all(
    [
      path.join(getUploadDir(), `${job.id}.docx`),
      resultPath(job.id),
      target,
      // Left behind if the server stopped while writing the edited report.
      `${target}.tmp`,
    ].map((file) => rm(file, { force: true })),
  );

  // deleteMany with the owner too, so the row removed is always the one
  // checked above. It doesn't fail if the row is already gone.
  await db.job.deleteMany({ where: { id: job.id, userId: session.user.id } });

  console.log(`JOB_DELETED job=${job.id}`);
  redirect("/?deleted=1");
}
