import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getStripe, StripeSetupError } from "@/lib/stripe";

const NO_STORE = { "Cache-Control": "no-store" };

// Opens Stripe's Customer Portal, where a subscriber can cancel or change
// their card, and returns its address. The customer id is read from the
// signed-in user's own row, never from the request, so nobody can open
// someone else's portal. It only reads the database: any change made in
// the portal reaches us through the Stripe webhook.
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Please sign in first." }, { status: 401, headers: NO_STORE });
  }
  const userId = session.user.id;

  try {
    // Set by the webhook after the first paid checkout.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    });
    const customerId = user?.stripeCustomerId;
    if (!customerId) {
      console.log(`PORTAL user=${userId} outcome=no_customer`);
      return Response.json(
        { error: "No subscription to manage." },
        { status: 404, headers: NO_STORE },
      );
    }

    // The return address comes from BETTER_AUTH_URL, never from the
    // request's Host header, which anyone can fake.
    const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new StripeSetupError("BETTER_AUTH_URL is not set.");

    const portal = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${base}/billing`,
    });

    console.log(`PORTAL user=${userId} outcome=created`);
    return Response.json({ url: portal.url }, { headers: NO_STORE });
  } catch (error) {
    // Same rule as checkout: only our own setup messages or the error's
    // kind are logged, because a Stripe message can include part of the key.
    const reason =
      error instanceof StripeSetupError
        ? error.message
        : ((error as { type?: unknown } | null)?.type ?? "unknown");
    console.error(`PORTAL user=${userId} outcome=failed reason=${String(reason)}`);
    return Response.json(
      { error: "The billing portal could not open. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
