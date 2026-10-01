// Next.js runs register() once when the server starts, before it handles
// any request. It does not run during `next build`.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEmailConfig } = await import("./lib/email");
    const { getAllowlist } = await import("./lib/allowlist");
    // If the email settings or ALLOWED_EMAILS are incomplete, stop the server
    // so a bad setup fails at startup and not on someone's first sign-in.
    // Throwing is not enough: Next.js logs the error and keeps serving.
    try {
      getEmailConfig();
      if (getAllowlist().mode === "anyone") {
        console.warn("ALLOWED_EMAILS is empty: any address can sign in (development only).");
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
}
