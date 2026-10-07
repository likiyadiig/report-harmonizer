import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Report Harmonizer</h1>
      {session ? (
        <>
          <p className="mb-3">Signed in as {session.user.email}</p>
          <p className="mb-3">
            <Link href="/upload" className="underline">
              Upload a report
            </Link>
          </p>
          <p className="mb-3">
            <Link href="/rules" className="underline">
              Your style rules
            </Link>
          </p>
          <form action={signOut}>
            <button type="submit" className="rounded border px-3 py-2">
              Sign out
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-3">
            Upload a Word report written by several people and get it back
            in one voice. Every change is a Word tracked change you can accept
            or reject. Where an edit might change the meaning, a comment asks
            you to check it.
          </p>
          <p className="mb-6">
            Made for consultants who edit reports with many authors.
          </p>

          <h2 className="mb-2 font-semibold">How it works</h2>
          <ol className="mb-6 list-decimal space-y-1 pl-5">
            <li>Sign in with your email.</li>
            <li>Upload your report as a .docx file.</li>
            <li>Download the edited file and review the changes in Word.</li>
          </ol>

          <h2 className="mb-2 font-semibold">See an example</h2>
          <p className="mb-2">
            A made up report, before and after. No sign in needed.
          </p>
          {/* Plain links, not <Link>: these are files to save, not pages.
              They are served from public/samples/ without sign in. */}
          <ul className="mb-6 list-disc space-y-1 pl-5">
            <li>
              <a
                href="/samples/sample-report-before.docx"
                download
                className="underline"
              >
                Download the original report (.docx)
              </a>
            </li>
            <li>
              <a
                href="/samples/sample-report-after.docx"
                download
                className="underline"
              >
                Download the edited report (.docx)
              </a>
            </li>
          </ul>

          <p className="mb-3">
            Sign in is by invitation for now, to keep costs under control.
          </p>
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>
        </>
      )}
    </main>
  );
}
