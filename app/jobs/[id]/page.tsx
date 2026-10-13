import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { harmonizedFileExists } from "@/lib/download";
import { failStuckJob, isStuck } from "@/lib/interrupted-jobs";
import { summaryText } from "@/lib/job-summary";
import { Card, PageHeading, PageWidth, primaryButton, secondaryButton } from "@/components/ui";
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
    <PageWidth>
      {/* Keep the status current until the job is done or failed. */}
      {(job.status === "queued" || job.status === "processing") && <AutoRefresh />}
      <PageHeading>{job.originalFilename ?? "Report (files deleted)"}</PageHeading>
      <Card>
        {/* The <dd> tags stay without classes: the tests look for the
            exact markup, so they are styled from the <dl> instead. */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr] sm:gap-y-3 [&_dd]:mb-3 [&_dd]:font-medium sm:[&_dd]:mb-0 [&_dt]:text-sm [&_dt]:text-muted sm:[&_dt]:text-base">
          <dt>Status</dt>
          <dd>{job.status}</dd>
          {/* job.error is always one of our own short, fixed messages. */}
          {job.status === "failed" && job.error && (
            <>
              <dt>Reason</dt>
              <dd>{job.error}</dd>
            </>
          )}
          <dt>Uploaded</dt>
          <dd>
            <LocalTime date={job.createdAt.toISOString()} />
          </dd>
          {job.finishedAt && (
            <>
              <dt>Finished</dt>
              <dd>
                <LocalTime date={job.finishedAt.toISOString()} />
              </dd>
            </>
          )}
          <dt>Paragraphs to harmonize</dt>
          {/* Jobs uploaded before paragraphs were counted have no count. */}
          <dd>{job.paragraphsTotal ?? "Not counted"}</dd>
        </dl>
        {job.status === "done" && (
          <section className="mt-6 border-t border-line pt-6">
            <p>{summaryText(job)}</p>
            {fileReady ? (
              <>
                {/* A plain <a>, not <Link>: Link preloads its target, which
                    would download the report in the background. */}
                <a href={`/jobs/${job.id}/download`} className={`${primaryButton} mt-5 w-full sm:w-auto`}>
                  Download
                </a>
                <p className="mt-3 text-sm text-muted">
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
      </Card>
      {/* Always shown, so the way onward is obvious whatever the status. */}
      <Link href="/upload" className={`${secondaryButton} mt-6 w-full sm:w-auto`}>
        Upload another report
      </Link>
    </PageWidth>
  );
}
