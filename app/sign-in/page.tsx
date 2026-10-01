import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getEmailConfig, MAGIC_LINK_EXPIRES_MINUTES } from "@/lib/email";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/" },
      headers: await headers(),
    });
  } catch {
    // lib/email.ts has already logged an error code.
    redirect("/sign-in?error=send");
  }
  // redirect() works by throwing, so it stays outside the try above.
  redirect("/sign-in?sent=1");
}

export default async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  const { sent, error } = await searchParams;

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      {sent ? (
        <>
          <p>
            Check your email for a sign-in link. It expires in{" "}
            {MAGIC_LINK_EXPIRES_MINUTES} minutes.
          </p>
          {getEmailConfig().mode === "terminal" && (
            <p className="mt-2 text-sm text-gray-600">
              Development without EMAIL_API_KEY: the link is in the server
              terminal.
            </p>
          )}
        </>
      ) : (
        <form action={sendLink} className="flex flex-col gap-3">
          {error === "send" && (
            <p role="alert" className="text-red-700">
              We couldn&apos;t send your sign-in link. Please try again in a
              few minutes.
            </p>
          )}
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded border px-3 py-2"
          />
          <button type="submit" className="rounded bg-black px-3 py-2 text-white">
            Send sign-in link
          </button>
        </form>
      )}
    </main>
  );
}
