import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getPriceId, getStripe, StripeSetupError } from "@/lib/stripe";

const NO_STORE = { "Cache-Control": "no-store" };

// Starts a Stripe Checkout for the monthly subscription and returns the
// address of Stripe's payment page. It grants nothing and writes nothing
// to the database: access is granted only by the Stripe webhook, once
// Stripe confirms the payment. Landing on the success page proves nothing.
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return Response.json({ error: "Please sign in first." }, { status: 401, headers: NO_STORE });
  }
  const userId = session.user.id;

  try {
    // The return addresses come from BETTER_AUTH_URL, never from the
    // request's Host header, which anyone can fake to send a paying user
    // to another site. Joined as text so Stripe's {CHECKOUT_SESSION_ID}
    // placeholder stays exactly as written; Stripe fills it in.
    const base = (process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "");
    if (!base) throw new StripeSetupError("BETTER_AUTH_URL is not set.");

    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: getPriceId(), quantity: 1 }],
      // How the webhook will know which user paid.
      client_reference_id: userId,
      // Fills in the email field on Stripe's page.
      customer_email: session.user.email,
      success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/billing`,
    });
    if (!checkout.url) throw new Error("Stripe returned no checkout address.");

    console.log(`CHECKOUT user=${userId} outcome=created`);
    return Response.json({ url: checkout.url }, { headers: NO_STORE });
  } catch (error) {
    // Our own setup messages name a setting and are safe to log. For
    // anything else, only the error's kind is logged: a Stripe message can
    // include part of the key.
    const reason =
      error instanceof StripeSetupError
        ? error.message
        : ((error as { type?: unknown } | null)?.type ?? "unknown");
    console.error(`CHECKOUT user=${userId} outcome=failed reason=${String(reason)}`);
    return Response.json(
      { error: "Checkout could not start. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
