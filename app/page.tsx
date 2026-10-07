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

  if (session) {
    return (
      <main className="mx-auto max-w-sm p-8">
        <h1 className="mb-4 text-xl font-semibold">Report Harmonizer</h1>
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
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="mb-6 text-3xl font-semibold tracking-tight sm:text-4xl">
        Report Harmonizer
      </h1>
      <p className="mb-3 text-lg text-gray-700">
        Upload a Word report written by several people and get it back in
        one voice. Every change is a Word tracked change you can accept or
        reject. Where an edit might change the meaning, a comment asks you to
        check it.
      </p>
      <p className="text-gray-700">
        Made for consultants who edit reports with many authors.
      </p>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold">Why</h2>
        <p>
          Fixing mixed writing styles by hand takes hours. AI tools can do it
          faster, but they often change the meaning.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Sign in with your email.</li>
          <li>Upload your report as a .docx file.</li>
          <li>Download the edited file and review the changes in Word.</li>
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="mb-3 text-lg font-semibold">See an example</h2>
        <p className="mb-4">
          A made up report, before and after. No sign in needed.
        </p>
        {/* Plain links, not <Link>: these are files to save, not pages.
            They are served from public/samples/ without sign in. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <a
            href="/samples/sample-report-before.docx"
            download
            className="block rounded-lg border border-gray-300 p-4 hover:border-gray-500 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            Download the original report (.docx)
          </a>
          <a
            href="/samples/sample-report-after.docx"
            download
            className="block rounded-lg border border-gray-300 p-4 hover:border-gray-500 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            Download the edited report (.docx)
          </a>
        </div>
      </section>

      <section className="mt-12">
        <p className="mb-4">
          Sign in is by invitation for now, to keep costs under control.
        </p>
        <Link
          href="/sign-in"
          className="inline-block rounded-md bg-gray-900 px-5 py-2.5 font-medium text-white hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          Sign in
        </Link>
      </section>
    </main>
  );
}
