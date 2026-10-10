import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { harmonizedFileExists } from "@/lib/download";
import { failStuckJob, isStuck } from "@/lib/interrupted-jobs";
import { summaryText } from "@/lib/job-summary";
import { AutoRefresh } from "./auto-refresh";
import { LocalTime } from "./local-time";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const { id } = await params;
  // Filtering by user too means someone else's job looks exactly like a
  // job that doesn't exist.
  const where = { id, userId: session.user.id };
  let job = await db.job.findFirst({ where });
  if (!job) notFound();

  // Unfinished jobs are otherwise only cleaned up when the server starts.
  if (isStuck(job)) {
    await failStuckJob(job.id);
    job = await db.job.findFirst({ where });
    if (!job) notFound();
  }

  const fileReady = job.status === "done" && (await harmonizedFileExists(job.id));

  return (
    <main className="mx-auto max-w-2xl p-8">
      {/* Keep the status current until the job is done or failed. */}
      {(job.status === "queued" || job.status === "processing") && <AutoRefresh />}
      <Link href="/" className="text-sm underline">
        Home
      </Link>
      <h1 className="mt-2 mb-4 text-xl font-semibold">
        {job.originalFilename ?? "Report (files deleted)"}
      </h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-gray-600">Status</dt>
        <dd>{job.status}</dd>
        {/* job.error is always one of our own short, fixed messages. */}
        {job.status === "failed" && job.error && (
          <>
            <dt className="text-gray-600">Reason</dt>
            <dd>{job.error}</dd>
          </>
        )}
        <dt className="text-gray-600">Uploaded</dt>
        <dd>
          <LocalTime date={job.createdAt.toISOString()} />
        </dd>
        {job.finishedAt && (
          <>
            <dt className="text-gray-600">Finished</dt>
            <dd>
              <LocalTime date={job.finishedAt.toISOString()} />
            </dd>
          </>
        )}
        <dt className="text-gray-600">Paragraphs to harmonize</dt>
        {/* Jobs uploaded before paragraphs were counted have no count. */}
        <dd>{job.paragraphsTotal ?? "Not counted"}</dd>
      </dl>
      {job.status === "done" && (
        <section className="mt-6">
          <p>{summaryText(job)}</p>
          {fileReady ? (
            <>
              {/* A plain <a>, not <Link>: Link preloads its target, which
                  would download the report in the background. */}
              <a
                href={`/jobs/${job.id}/download`}
                className="mt-4 inline-block rounded bg-black px-3 py-2 text-white"
              >
                Download
              </a>
              <p className="mt-2 text-sm text-gray-600">
                Open the file in Word and use Review to accept or reject each change.
              </p>
            </>
          ) : (
            <p className="mt-4">
              This file is no longer available. Please upload the report again.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
