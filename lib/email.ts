// Sign-in links stop working after this long. The email text says so too.
export const MAGIC_LINK_EXPIRES_MINUTES = 15;

const RESEND_URL = "https://api.resend.com/emails";
const SUBJECT = "Your sign-in link for Report Harmonizer";

type EmailConfig =
  | { mode: "send"; apiKey: string; from: string }
  | { mode: "terminal" };

// Decides how sign-in links are delivered. Throws if the settings are
// incomplete. Links are printed only when NODE_ENV is exactly
// "development", so a server with NODE_ENV missing or misspelled fails
// instead of writing sign-in links into its log. In development a key
// without EMAIL_FROM is a half-finished setup, so that throws too.
export function getEmailConfig(): EmailConfig {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (apiKey && from) return { mode: "send", apiKey, from };
  if (!apiKey && process.env.NODE_ENV === "development") {
    return { mode: "terminal" };
  }
  const missing = [!apiKey && "EMAIL_API_KEY", !from && "EMAIL_FROM"]
    .filter(Boolean)
    .join(" and ");
  throw new Error(`${missing} must be set to send sign-in emails.`);
}

// Sends the sign-in link. On failure it logs an error code only, never the
// link, the address or Resend's message (which can repeat the address),
// and throws.
export async function sendSignInEmail(email: string, url: string): Promise<void> {
  const config = getEmailConfig();

  if (config.mode === "terminal") {
    console.log(`Sign-in link for ${email}: ${url}`);
    return;
  }

  let response: Response;
  try {
    response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: email,
        subject: SUBJECT,
        text: emailText(url),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const code = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network";
    console.error(`EMAIL_SEND_FAILED code=${code}`);
    throw new Error("Could not send the sign-in email.");
  }

  if (!response.ok) {
    const code = await resendErrorCode(response);
    console.error(`EMAIL_SEND_FAILED status=${response.status} code=${code}`);
    throw new Error("Could not send the sign-in email.");
  }
}

function emailText(url: string): string {
  return `Use this link to sign in to Report Harmonizer. It expires in ${MAGIC_LINK_EXPIRES_MINUTES} minutes.\n\n${url}\n`;
}

// Resend's error body has a short code in "name", like "validation_error".
// Only a plain lowercase code is logged; anything else becomes "unknown".
async function resendErrorCode(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.name === "string" && /^[a-z_]+$/.test(body.name)) {
      return body.name;
    }
  } catch {}
  return "unknown";
}
