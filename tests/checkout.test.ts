import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The checkout endpoint with sign-in, the database and Stripe as stand-ins.
// The Stripe stand-in replaces the stripe package itself, so the real
// lib/stripe.ts runs and no request ever reaches Stripe.

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string } } | null,
  // What the endpoint asked Stripe to create.
  created: [] as Record<string, unknown>[],
  // Every call made on the database stand-in, by model and method.
  dbCalls: [] as string[],
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => mocks.session } },
}));

// Records any call, such as db.user.update(...), and returns nothing.
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_db, model) =>
        new Proxy(
          {},
          {
            get: (_model, method) => async () => {
              mocks.dbCalls.push(`${String(model)}.${String(method)}`);
            },
          },
        ),
    },
  ),
}));

vi.mock("stripe", () => ({
  default: class {
    checkout = {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          mocks.created.push(params);
          return { url: "https://checkout.stripe.com/c/pay/cs_test_123" };
        },
      },
    };
  },
}));

// The request as an attacker might send it: a faked Host and forwarded
// host. The return addresses must ignore both.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    }),
}));

import { POST } from "@/app/api/checkout/route";

beforeEach(() => {
  mocks.session = null;
  mocks.created = [];
  mocks.dbCalls = [];
  vi.stubEnv("BETTER_AUTH_URL", "https://harmonizer.example.com");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stand_in");
  vi.stubEnv("STRIPE_PRICE_ID", "price_stand_in");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/checkout", () => {
  it("returns 401 without a session and starts no checkout", async () => {
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mocks.created).toEqual([]);
  });

  it("builds the success and cancel addresses from BETTER_AUTH_URL, not the Host header", async () => {
    mocks.session = { user: { id: "user1", email: "you@example.com" } };
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0].success_url).toBe(
      "https://harmonizer.example.com/billing/success?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(mocks.created[0].cancel_url).toBe("https://harmonizer.example.com/billing");
    expect(JSON.stringify(mocks.created[0])).not.toContain("evil.example");
  });

  it("sets client_reference_id to the signed-in user's id", async () => {
    mocks.session = { user: { id: "user1", email: "you@example.com" } };
    const response = await POST();
    expect(mocks.created[0].client_reference_id).toBe("user1");
    expect(mocks.created[0].mode).toBe("subscription");
    expect(mocks.created[0].line_items).toEqual([{ price: "price_stand_in", quantity: 1 }]);
    expect(await response.json()).toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
    });
  });

  it("fills in the signed-in user's email on Stripe's page", async () => {
    mocks.session = { user: { id: "user1", email: "you@example.com" } };
    await POST();
    expect(mocks.created[0].customer_email).toBe("you@example.com");
  });

  it("writes nothing to the database", async () => {
    mocks.session = { user: { id: "user1", email: "you@example.com" } };
    await POST();
    mocks.session = null;
    await POST();
    expect(mocks.dbCalls).toEqual([]);
  });
});
