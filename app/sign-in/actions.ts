"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isEmailAllowed } from "@/lib/allowlist";
import { allowSignInAttempt, clientIp } from "@/lib/sign-in-limits";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "limited" }
  | { status: "error" };

// One @, text on both sides, a dot in the part after it, no spaces.
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Returns the address the link was sent to, so the page can show it and a
// typo is easy to spot. It goes back to the browser only, never into a URL
// or a log. The result is the same whether or not the address is on
// ALLOWED_EMAILS, also when a limit is hit, so the page never reveals who
// has access.
export async function sendLink(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  if (email === "") return { status: "empty" };
  if (!LOOKS_LIKE_EMAIL.test(email)) return { status: "invalid" };

  const requestHeaders = await headers();
  if (!allowSignInAttempt(email, clientIp(requestHeaders))) {
    return { status: "limited" };
  }

  // Checked here as well as in lib/allowlist.ts, because Better Auth saves
  // a Verification row before it asks whether to send. This way an address
  // that is not on the list never reaches the database.
  if (!isEmailAllowed(email)) {
    console.log("SIGN_IN_REFUSED code=not_allowed");
    return { status: "sent", email };
  }

  try {
    await auth.api.signInMagicLink({
      // A link that is expired, used or invalid comes back to the sign-in
      // page with ?error=..., which shows a message.
      body: { email, callbackURL: "/", errorCallbackURL: "/sign-in" },
      headers: requestHeaders,
    });
  } catch {
    // lib/email.ts has already logged an error code.
    return { status: "error" };
  }
  return { status: "sent", email };
}
