import "server-only";

import { db } from "@/lib/db";

// Shown instead of the upload form, and returned by the upload action, to a
// signed-in user who can't upload.
export const SUBSCRIBE_MESSAGE =
  "Report Harmonizer costs 15 euros a month. Subscribe to upload your first report.";

// Every report costs real Claude API money and anyone can sign in, so only
// an active subscription can upload. "free", "past_due" (the last payment
// failed) and "canceled" can't. The status is set only by the Stripe
// webhook, so a user can't change it themselves.
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true },
  });
  return user?.subscriptionStatus === "active";
}
