// Next.js runs register() once when the server starts, before it handles
// any request. It does not run during `next build`.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEmailConfig } = await import("./lib/email");
    const { getAllowlist } = await import("./lib/allowlist");
    const {
      checkAuthSecret,
      checkAuthUrl,
      checkDatabaseUrl,
      checkStripeConfig,
      getAnthropicKey,
      getUploadDir,
    } = await import("./lib/config");
    // If DATABASE_URL, the email settings, ALLOWED_EMAILS, UPLOAD_DIR,
    // BETTER_AUTH_URL, BETTER_AUTH_SECRET, ANTHROPIC_API_KEY or the Stripe
    // settings are incomplete, stop the server so a bad setup fails at
    // startup and not on someone's first sign-in, upload or checkout.
    // Throwing is not enough: Next.js logs the error and keeps serving.
    try {
      checkDatabaseUrl();
      getEmailConfig();
      if (getAllowlist().mode === "anyone") {
        console.warn("ALLOWED_EMAILS is empty: any address can sign in (development only).");
      }
      const uploadDir = getUploadDir();
      if (!process.env.UPLOAD_DIR) {
        console.warn(`UPLOAD_DIR is empty: uploads go to ${uploadDir} (development only).`);
      }
      checkAuthUrl();
      checkAuthSecret();
      if (!getAnthropicKey()) {
        console.warn("ANTHROPIC_API_KEY is empty: uploaded reports will fail instead of being harmonized (development only).");
      }
      checkStripeConfig();
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
        console.warn("STRIPE_SECRET_KEY or STRIPE_PRICE_ID is empty: the Upgrade button will fail (development only).");
      }
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.warn("STRIPE_WEBHOOK_SECRET is empty: the Stripe webhook will refuse every event (development only).");
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }

    // Jobs still at "queued" or "processing" were cut off when the server
    // last stopped. A database problem here is logged but doesn't stop the
    // server: the database may simply not be up yet.
    try {
      const { failInterruptedJobs } = await import("./lib/interrupted-jobs");
      const count = await failInterruptedJobs();
      if (count > 0) console.warn(`JOBS_INTERRUPTED count=${count}`);
    } catch {
      console.error("JOBS_INTERRUPTED_CHECK_FAILED");
    }
  }
}
