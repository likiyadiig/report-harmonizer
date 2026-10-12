import "server-only";
import Stripe from "stripe";

// Thrown when a Stripe setting is missing. The message names the setting,
// never its value, so it is safe to log.
export class StripeSetupError extends Error {}

let client: Stripe | undefined;

// The Stripe client, created on first use. STRIPE_SECRET_KEY has no
// fallback: without it, checkout fails instead of using some other key.
// In production, checkStripeConfig in lib/config.ts has already checked it
// at startup.
export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeSetupError("STRIPE_SECRET_KEY is not set.");
  client = new Stripe(key);
  return client;
}

// The Stripe price people subscribe to. No fallback, for the same reason.
export function getPriceId(): string {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new StripeSetupError("STRIPE_PRICE_ID is not set.");
  return priceId;
}
