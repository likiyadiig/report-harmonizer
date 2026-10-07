"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error" };

// Returns the address the link was sent to, so the page can show it and a
// typo is easy to spot. It goes back to the browser only, never into a URL
// or a log. The result is the same whether or not the address is on
// ALLOWED_EMAILS, so the page never reveals who has access.
export async function sendLink(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: "/" },
      headers: await headers(),
    });
  } catch {
    // lib/email.ts has already logged an error code.
    return { status: "error" };
  }
  return { status: "sent", email };
}
