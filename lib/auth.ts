import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db } from "@/lib/db";

// Reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment.
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  plugins: [
    magicLink({
      // No email yet: print the link to the server console instead.
      sendMagicLink: ({ email, url }) => {
        console.log(`Magic link for ${email}: ${url}`);
      },
    }),
    // Must be last. Lets Server Actions set and clear the session cookie.
    nextCookies(),
  ],
});
