import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "");
  await auth.api.signInMagicLink({
    body: { email, callbackURL: "/" },
    headers: await headers(),
  });
  redirect("/sign-in?sent=1");
}

export default async function SignIn({ searchParams }: PageProps<"/sign-in">) {
  const { sent } = await searchParams;

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      {sent ? (
        <p>Check the server terminal for your sign-in link.</p>
      ) : (
        <form action={sendLink} className="flex flex-col gap-3">
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
