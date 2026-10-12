import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Stripe webhook with the database as a stand-in. Stripe itself is the
// real library: requests are signed with its test helper and a made-up
// secret, and checked by the real constructEvent. Nothing is sent to
// Stripe; signing and checking happen on this machine.

const SECRET = "whsec_test_made_up_secret";

type UserRow = { id: string; subscriptionStatus: string; stripeCustomerId: string | null };

const mocks = vi.hoisted(() => ({
  users: new Map<string, UserRow>(),
  // stripeEventId of every ProcessedEvent row.
  events: new Set<string>(),
  userUpdates: 0,
  failUserUpdate: false,
}));

// Keeps the User and ProcessedEvent tables in memory. A transaction works
// on copies and keeps them only if it finishes, like a real rollback.
vi.mock("@/lib/db", async () => {
  const { Prisma } = await import("@/app/generated/prisma/client");
  const findUser = (users: Map<string, UserRow>, where: Partial<UserRow>) =>
    [...users.values()].find((user) =>
      Object.entries(where).every(([key, value]) => user[key as keyof UserRow] === value),
    ) ?? null;

  return {
    db: {
      $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
        const users = new Map([...mocks.users].map(([id, user]) => [id, { ...user }]));
        const events = new Set(mocks.events);
        const tx = {
          processedEvent: {
            create: async ({ data }: { data: { stripeEventId: string } }) => {
              if (events.has(data.stripeEventId)) {
                throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
                  code: "P2002",
                  clientVersion: "7.10.0",
                });
              }
              events.add(data.stripeEventId);
              return { id: `pe_${data.stripeEventId}`, ...data };
            },
          },
          user: {
            findUnique: async ({ where }: { where: Partial<UserRow> }) => findUser(users, where),
            update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
              if (mocks.failUserUpdate) throw new Error("database stand-in: update failed");
              const user = users.get(where.id);
              if (!user) throw new Error("not found");
              // Like Prisma, a field set to undefined is left as it is.
              for (const [key, value] of Object.entries(data)) {
                if (value !== undefined) Object.assign(user, { [key]: value });
              }
              mocks.userUpdates++;
              return user;
            },
          },
        };
        const result = await work(tx);
        mocks.users = users;
        mocks.events = events;
        return result;
      },
    },
  };
});

import { POST } from "@/app/api/webhooks/stripe/route";

const stripe = new Stripe("sk_test_stand_in");

function stripeEvent(type: string, object: Record<string, unknown>, id = "evt_test_1") {
  return {
    id,
    object: "event",
    type,
    api_version: "2026-09-30",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: null,
    data: { object },
  };
}

// A request as Stripe sends it, signed with the given secret. With
// secret null, it has no signature header.
function webhookRequest(event: object, secret: string | null = SECRET) {
  const body = JSON.stringify(event);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) {
    headers["stripe-signature"] = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  }
  return new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers, body });
}

const checkoutCompleted = stripeEvent("checkout.session.completed", {
  id: "cs_test_1",
  object: "checkout.session",
  client_reference_id: "user1",
  customer: "cus_test_1",
  payment_status: "paid",
});

// A copy of both tables, to check that nothing changed.
function snapshot() {
  return {
    users: structuredClone([...mocks.users.values()]),
    events: [...mocks.events],
  };
}

beforeEach(() => {
  mocks.users = new Map([
    ["user1", { id: "user1", subscriptionStatus: "free", stripeCustomerId: null }],
  ]);
  mocks.events = new Set();
  mocks.userUpdates = 0;
  mocks.failUserUpdate = false;
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stand_in");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/webhooks/stripe", () => {
  it("returns 400 for an unsigned or wrongly signed request and changes nothing", async () => {
    const before = snapshot();

    const unsigned = await POST(webhookRequest(checkoutCompleted, null));
    expect(unsigned.status).toBe(400);

    const wronglySigned = await POST(webhookRequest(checkoutCompleted, "whsec_some_other_secret"));
    expect(wronglySigned.status).toBe(400);

    expect(snapshot()).toEqual(before);
  });

  it("sets the user to active and saves the customer id on a signed checkout.session.completed", async () => {
    const response = await POST(webhookRequest(checkoutCompleted));
    expect(response.status).toBe(200);
    expect(mocks.users.get("user1")).toEqual({
      id: "user1",
      subscriptionStatus: "active",
      stripeCustomerId: "cus_test_1",
    });
  });

  it("leaves the user unchanged on a completed checkout with payment_status unpaid", async () => {
    const before = snapshot().users;
    const unpaid = stripeEvent(
      "checkout.session.completed",
      {
        id: "cs_test_unpaid",
        object: "checkout.session",
        client_reference_id: "user1",
        customer: "cus_test_1",
        payment_status: "unpaid",
      },
      "evt_test_unpaid",
    );
    await POST(webhookRequest(unpaid));
    expect(snapshot().users).toEqual(before);
  });

  it("changes the user only once when the same event is delivered twice", async () => {
    await POST(webhookRequest(checkoutCompleted));
    const afterFirst = snapshot();

    const second = await POST(webhookRequest(checkoutCompleted));
    expect(second.status).toBe(200);
    expect(mocks.userUpdates).toBe(1);
    expect(snapshot()).toEqual(afterFirst);
  });

  it("returns 200 for a signed event of another type and changes nothing", async () => {
    const before = snapshot();
    const response = await POST(
      webhookRequest(stripeEvent("customer.created", { id: "cus_test_1", object: "customer" })),
    );
    expect(response.status).toBe(200);
    expect(snapshot()).toEqual(before);
  });

  it("does not record the event as processed if updating the user fails", async () => {
    mocks.failUserUpdate = true;
    await POST(webhookRequest(checkoutCompleted));
    expect(mocks.events.has(checkoutCompleted.id)).toBe(false);
  });
});
