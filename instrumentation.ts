// Next.js runs register() once when the server starts, before it handles
// any request. It does not run during `next build`.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEmailConfig } = await import("./lib/email");
    const { getAllowlist } = await import("./lib/allowlist");
    const { checkAuthUrl, getUploadDir } = await import("./lib/config");
    // If the email settings, ALLOWED_EMAILS, UPLOAD_DIR or BETTER_AUTH_URL
    // are incomplete, stop the server so a bad setup fails at startup and
    // not on someone's first sign-in or upload.
    // Throwing is not enough: Next.js logs the error and keeps serving.
    try {
      getEmailConfig();
      if (getAllowlist().mode === "anyone") {
        console.warn("ALLOWED_EMAILS is empty: any address can sign in (development only).");
      }
      const uploadDir = getUploadDir();
      if (!process.env.UPLOAD_DIR) {
        console.warn(`UPLOAD_DIR is empty: uploads go to ${uploadDir} (development only).`);
      }
      checkAuthUrl();
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
}
