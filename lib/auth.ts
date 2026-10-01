import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "@/lib/db";
import { MAGIC_LINK_EXPIRES_MINUTES, sendSignInEmail } from "@/lib/email";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_EXPIRES_MINUTES * 60, // in seconds
      // Emails the link. See lib/email.ts for the development fallback.
      sendMagicLink: ({ email, url }) => sendSignInEmail(email, url),
    }),
    // Must be last. Lets Server Actions set and clear the session cookie.
    nextCookies(),
  ],
});
