import { getEmailConfig, MAGIC_LINK_EXPIRES_MINUTES } from "@/lib/email";
import { SignInForm } from "./sign-in-form";

// Better Auth sends a sign-in link that didn't work here with ?error=...
// (for example INVALID_TOKEN). Any error shows the same fixed message; the
// code itself is never shown.
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
      <SignInForm
        expiresMinutes={MAGIC_LINK_EXPIRES_MINUTES}
        linkInTerminal={linkInTerminal()}
        linkFailed={error !== undefined}
      />
    </main>
  );
}

// Incomplete email settings must not break the page itself. Sending a link
// then fails and the form shows its error message.
function linkInTerminal(): boolean {
  try {
    return getEmailConfig().mode === "terminal";
  } catch {
    return false;
  }
}
