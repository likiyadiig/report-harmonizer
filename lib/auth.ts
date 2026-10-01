import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { canStartSession, sendSignInLinkIfAllowed } from "@/lib/allowlist";
import { db } from "@/lib/db";
import { MAGIC_LINK_EXPIRES_MINUTES } from "@/lib/email";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  databaseHooks: {
    session: {
      create: {
        // Runs before every sign-in. Returning false means no session is
        // created. See canStartSession in lib/allowlist.ts.
        before: async (session) => {
          const user = await db.user.findUnique({
            where: { id: session.userId },
            select: { email: true },
          });
          if (!canStartSession(user?.email)) return false;
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_EXPIRES_MINUTES * 60, // in seconds
      // Emails the link, only to addresses on ALLOWED_EMAILS. See
      // lib/allowlist.ts, and lib/email.ts for the development fallback.
      sendMagicLink: ({ email, url }) => sendSignInLinkIfAllowed(email, url),
    }),
    // Must be last. Lets Server Actions set and clear the session cookie.
    nextCookies(),
  ],
});
