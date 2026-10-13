import type Stripe from "stripe";
import { Prisma, SubscriptionStatus } from "@/app/generated/prisma/client";
import { db } from "@/lib/db";
import { getStripe } from "@/lib/stripe";

// Stripe events are a few KB. Anything bigger is refused before it is
// read into memory, so a fake request can't fill up the server's memory.
const MAX_BODY_BYTES = 1024 * 1024;

// What an event changes: which user, and their new status.
type Change = {
  status: SubscriptionStatus;
  // null when the event doesn't say which user it is for.
  where: { id: string } | { stripeCustomerId: string } | null;
  // Saved on the user, so later events can find them by customer id.
  stripeCustomerId?: string;
};

// Thrown inside the transaction when the event was already processed.
class DuplicateEvent extends Error {}

// Every line starts with the time. Lines never include keys, emails or the
// request body: only event ids, event types, user ids and statuses.
function log(message: string) {
  console.log(`${new Date().toISOString()} stripe-webhook: ${message}`);
}
function logError(message: string) {
  console.error(`${new Date().toISOString()} stripe-webhook: ${message}`);
}

// Stripe sends the customer either as its id or as the full object.
function customerIdOf(customer: string | { id: string } | null): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

// The change each handled event makes. "not_paid" means a completed
// checkout whose money hasn't arrived: recorded, but nothing changes.
// null means the event type is not one we act on.
function changeFor(event: Stripe.Event): Change | "not_paid" | null {
  switch (event.type) {
    case "checkout.session.completed": {
      const checkout = event.data.object;
      // Only cards are enabled, so this is "paid" in practice. A delayed
      // method such as SEPA completes the checkout before the money arrives.
      if (checkout.payment_status !== "paid") return "not_paid";
      // Set by our checkout route to the signed-in user's id.
      const userId = checkout.client_reference_id;
      return {
        status: SubscriptionStatus.active,
        where: userId ? { id: userId } : null,
        stripeCustomerId: customerIdOf(checkout.customer) ?? undefined,
      };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const customerId = customerIdOf(event.data.object.customer);
      return {
        status:
          event.type === "invoice.paid"
            ? SubscriptionStatus.active
            : SubscriptionStatus.past_due,
        where: customerId ? { stripeCustomerId: customerId } : null,
      };
    }
    case "customer.subscription.deleted": {
      const customerId = customerIdOf(event.data.object.customer);
      return {
        status: SubscriptionStatus.canceled,
        where: customerId ? { stripeCustomerId: customerId } : null,
      };
    }
    default:
      return null;
  }
}

// Reads the body exactly as Stripe sent it, as bytes, stopping as soon as
// it goes over the limit. Returns null if it is too big.
async function readBody(request: Request): Promise<Buffer | null> {
  // A sender that declares a big body is refused without reading it.
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return null;
  if (!request.body) return Buffer.alloc(0);

  // The declared length can be missing or wrong, so the bytes are also
  // counted as they arrive.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

// Receives events from Stripe. There is no session: anyone can call this
// address, so the Stripe signature is the only proof that the event is
// real, and nothing happens until it has been checked. Stripe resends an
// event until it gets a 2xx answer, so every outcome that shouldn't be
// retried returns 200.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    logError("signature verification failed (no signature header)");
    return new Response(null, { status: 400 });
  }

  // Our own setup problem, not the sender's: 500, so Stripe retries once
  // it is fixed. In production, startup already refuses without these.
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    logError("STRIPE_WEBHOOK_SECRET is not set");
    return new Response(null, { status: 500 });
  }
  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    logError("STRIPE_SECRET_KEY is not set");
    return new Response(null, { status: 500 });
  }

  const body = await readBody(request);
  if (!body) {
    logError(`body over ${MAX_BODY_BYTES} bytes, refused`);
    return new Response(null, { status: 413 });
  }

  let event: Stripe.Event;
  try {
    // Checks the signature against the exact bytes received, and that the
    // event was signed in the last 5 minutes, so an old one can't be replayed.
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    // The error message is not logged: it can include part of the header.
    logError("signature verification failed");
    return new Response(null, { status: 400 });
  }
  log("signature verified");
  log(`event ${event.id} type=${event.type}`);

  const change = changeFor(event);
  if (!change) return new Response(null, { status: 200 });

  try {
    // Recording the event and changing the user happen together or not at
    // all. If the user update fails, the event is not recorded either, so
    // Stripe's retry will apply it.
    const userId = await db.$transaction(async (tx) => {
      // No "does it exist?" check first: the unique constraint on
      // stripeEventId decides. If the same event arrives twice at once,
      // Postgres makes the second insert wait for the first and then
      // rejects it.
      try {
        await tx.processedEvent.create({ data: { stripeEventId: event.id } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new DuplicateEvent();
        }
        throw error;
      }

      if (change === "not_paid" || !change.where) return null;
      const user = await tx.user.findUnique({ where: change.where, select: { id: true } });
      if (!user) return null;
      await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: change.status,
          stripeCustomerId: change.stripeCustomerId,
        },
      });
      return user.id;
    });

    log(`recorded event ${event.id}`);
    if (change === "not_paid") {
      log(`checkout not paid yet, event ${event.id}, nothing changed`);
    } else if (userId) {
      log(`user ${userId} subscription -> ${change.status}`);
    } else {
      // Stripe resending it wouldn't help, so this still returns 200.
      log(`no user for event ${event.id}, nothing changed`);
    }
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof DuplicateEvent) {
      log(`duplicate event ${event.id}, skipping`);
      return new Response(null, { status: 200 });
    }
    // Only the error code is logged: a database message can include values.
    const reason =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "unknown";
    logError(`processing event ${event.id} failed reason=${reason}, not recorded`);
    return new Response(null, { status: 500 });
  }
}
