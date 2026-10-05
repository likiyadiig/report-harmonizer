import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AutoRefresh } from "./auto-refresh";

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
  const job = await db.job.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!job) notFound();

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
          {job.createdAt.toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </dd>
        <dt className="text-gray-600">Paragraphs to harmonize</dt>
        {/* Jobs uploaded before paragraphs were counted have no count. */}
        <dd>{job.paragraphsTotal ?? "Not counted"}</dd>
      </dl>
    </main>
  );
}
