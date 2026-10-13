import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { primaryButton } from "./ui";

async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}

// The session lookup needs the database. This header sits in the root
// layout, and an error there can't be caught by the pages' error.tsx, so
// a failure would break every page, including the job page that is meant
// to keep retrying while the database is down. On failure, show only
// the wordmark.
type State = "signed-in" | "signed-out" | "unknown";

async function sessionState(): Promise<State> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session ? "signed-in" : "signed-out";
  } catch {
    return "unknown";
  }
}

const navLink =
  "rounded-md px-2 py-1 text-muted hover:bg-surface hover:text-navy";

export async function SiteHeader() {
  const state = await sessionState();

  return (
    <header className="border-b border-line/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
        <Link href="/" className="rounded-md text-lg font-semibold tracking-tight text-navy">
          Report Harmonizer
        </Link>

        {state === "signed-out" && (
          <nav className="flex items-center gap-3">
            <Link href="/sign-in" className={navLink}>
              Sign in
            </Link>
            <Link href="/sign-in" className={`${primaryButton} px-4 py-2 text-sm`}>
              Try it
            </Link>
          </nav>
        )}

        {state === "signed-in" && (
          <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
            <Link href="/upload" className={navLink}>
              Upload
            </Link>
            <Link href="/rules" className={navLink}>
              Style rules
            </Link>
            <Link href="/billing" className={navLink}>
              Billing
            </Link>
            <form action={signOut}>
              <button type="submit" className={`${navLink} cursor-pointer`}>
                Sign out
              </button>
            </form>
          </nav>
        )}
      </div>
    </header>
  );
}
