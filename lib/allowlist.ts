import { sendSignInEmail } from "@/lib/email";

type Allowlist = { mode: "list"; emails: Set<string> } | { mode: "anyone" };

const ONE_ADDRESS = /^[^@\s]+@[^@\s]+$/;

// Reads ALLOWED_EMAILS: email addresses separated by commas. Case and spaces
// around each address are ignored. An empty list throws, except when NODE_ENV
// is exactly "development", where it lets any address sign in (npm run dev
// listens on localhost only). An entry that is not a single address is a typo
// (for example semicolons instead of commas), so that throws in every
// environment. Errors never repeat an address, only its position in the list.
export function getAllowlist(): Allowlist {
  const entries = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normalize)
    .filter(Boolean);

  const bad = entries.findIndex((entry) => !ONE_ADDRESS.test(entry));
  if (bad !== -1) {
    throw new Error(
      `ALLOWED_EMAILS entry ${bad + 1} is not a single email address. Separate addresses with commas.`,
    );
  }
  if (entries.length > 0) return { mode: "list", emails: new Set(entries) };
  if (process.env.NODE_ENV === "development") return { mode: "anyone" };
  throw new Error("ALLOWED_EMAILS must list at least one email address.");
}

export function isEmailAllowed(email: string): boolean {
  const allowlist = getAllowlist();
  return allowlist.mode === "anyone" || allowlist.emails.has(normalize(email));
}

// Called for every sign-in link. An address that is not on the list gets no
// email, but the caller still reports success, so the sign-in page looks the
// same either way and does not reveal who is on the list. The log line has a
// code only, never the address.
export async function sendSignInLinkIfAllowed(email: string, url: string): Promise<void> {
  if (!isEmailAllowed(email)) {
    console.log("SIGN_IN_REFUSED code=not_allowed");
    return;
  }
  await sendSignInEmail(email, url);
}

// Checked again when a sign-in link is opened, so a link sent before the
// address was removed from the list no longer signs anyone in.
export function canStartSession(email: string | undefined): boolean {
  if (email !== undefined && isEmailAllowed(email)) return true;
  console.log("SESSION_REFUSED code=not_allowed");
  return false;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}
