import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The billing portal endpoint with sign-in, the database and Stripe as
// stand-ins. The Stripe stand-in replaces the stripe package itself, so the
// real lib/stripe.ts runs and no request ever reaches Stripe.

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string } } | null,
  // Each user's row, by id, as the database stand-in returns it.
  users: {} as Record<string, { stripeCustomerId: string | null }>,
  // What the endpoint asked Stripe to create.
  created: [] as Record<string, unknown>[],
  // Every call made on the database stand-in, by model and method.
  dbCalls: [] as string[],
  // The arguments of each db.user.findUnique call.
  lookups: [] as unknown[],
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => mocks.session } },
}));

// db.user.findUnique returns the stand-in row for the id asked for. Any
// other call is recorded and returns nothing.
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get: (_db, model) =>
        new Proxy(
          {},
          {
            get: (_model, method) => async (args: { where?: { id?: string } }) => {
              mocks.dbCalls.push(`${String(model)}.${String(method)}`);
              if (model === "user" && method === "findUnique") {
                mocks.lookups.push(args);
                return mocks.users[args.where?.id ?? ""] ?? null;
              }
            },
          },
        ),
    },
  ),
}));

vi.mock("stripe", () => ({
  default: class {
    billingPortal = {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          mocks.created.push(params);
          return { url: "https://billing.stripe.com/p/session/test_123" };
        },
      },
    };
  },
}));

// The request as an attacker might send it: a faked Host and forwarded
// host. The return address must ignore both.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    }),
}));

import { POST } from "@/app/api/billing-portal/route";

beforeEach(() => {
  mocks.session = null;
  mocks.users = {
    paying: { stripeCustomerId: "cus_paying" },
    other: { stripeCustomerId: "cus_other" },
    never_paid: { stripeCustomerId: null },
  };
  mocks.created = [];
  mocks.dbCalls = [];
  mocks.lookups = [];
  vi.stubEnv("BETTER_AUTH_URL", "https://harmonizer.example.com");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stand_in");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/billing-portal", () => {
  it("returns 401 without a session and opens no portal", async () => {
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mocks.created).toEqual([]);
  });

  it("opens no portal for a user without a Stripe customer id", async () => {
    mocks.session = { user: { id: "never_paid", email: "you@example.com" } };
    const response = await POST();
    expect(response.status).toBe(404);
    expect(mocks.created).toEqual([]);
    expect(await response.json()).not.toHaveProperty("url");
  });

  it("opens the portal for the signed-in user's own customer id", async () => {
    mocks.session = { user: { id: "paying", email: "you@example.com" } };
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.lookups).toEqual([
      { where: { id: "paying" }, select: { stripeCustomerId: true } },
    ]);
    expect(mocks.created).toHaveLength(1);
    expect(mocks.created[0].customer).toBe("cus_paying");
    expect(await response.json()).toEqual({
      url: "https://billing.stripe.com/p/session/test_123",
    });
  });

  it("builds the return address from BETTER_AUTH_URL, not the Host header", async () => {
    mocks.session = { user: { id: "paying", email: "you@example.com" } };
    await POST();
    expect(mocks.created[0].return_url).toBe("https://harmonizer.example.com/billing");
    expect(JSON.stringify(mocks.created[0])).not.toContain("evil.example");
  });

  it("writes nothing to the database", async () => {
    mocks.session = { user: { id: "paying", email: "you@example.com" } };
    await POST();
    mocks.session = { user: { id: "never_paid", email: "you@example.com" } };
    await POST();
    mocks.session = null;
    await POST();
    expect(mocks.dbCalls).toEqual(["user.findUnique", "user.findUnique"]);
  });
});
