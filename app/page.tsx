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
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>
      )}
    </main>
  );
}
