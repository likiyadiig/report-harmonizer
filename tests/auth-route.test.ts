import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Better Auth's own "send me a sign-in link" address is refused, so the only
// way to ask for a link is the sign-in form, with its limits. Every other
// /api/auth request still reaches Better Auth.

const mocks = vi.hoisted(() => ({ reached: [] as string[] }));

vi.mock("@/lib/auth", () => ({ auth: {} }));
// A stand-in for Better Auth that records which requests reach it.
vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: () => {
    const handle = async (request: Request) => {
      mocks.reached.push(`${request.method} ${new URL(request.url).pathname}`);
      return new Response("from better auth", { status: 200 });
    };
    return { GET: handle, POST: handle, PATCH: handle, PUT: handle, DELETE: handle };
  },
}));

const { GET, POST } = await import("@/app/api/auth/[...all]/route");

const ORIGIN = "http://localhost:3001";
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.reached = [];
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function post(path: string) {
  return POST(
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "stranger@example.com" }),
    }),
  );
}

describe("POST /api/auth/sign-in/magic-link", () => {
  it.each([
    "/api/auth/sign-in/magic-link",
    "/api/auth/sign-in/magic-link/",
    "/API/Auth/Sign-In/Magic-Link",
    "/api/auth//sign-in/magic-link",
    "/api/auth/sign-in/magic%2Dlink",
    "/api/auth/sign-in/magic-link?callbackURL=/",
  ])("is refused for %s without reaching Better Auth", async (path) => {
    const response = await post(path);

    expect(response.status).toBe(404);
    expect(mocks.reached).toEqual([]);
    expect(log.mock.calls.flat().join("\n")).toBe("SIGN_IN_REFUSED code=direct_request");
  });
});

describe("other /api/auth requests", () => {
  it("passes other POSTs to Better Auth", async () => {
    const response = await post("/api/auth/sign-out");

    expect(response.status).toBe(200);
    expect(mocks.reached).toEqual(["POST /api/auth/sign-out"]);
  });

  it("passes the link in the email (a GET) to Better Auth", async () => {
    const response = await GET(
      new Request(`${ORIGIN}/api/auth/magic-link/verify?token=test-token`),
    );

    expect(response.status).toBe(200);
    expect(mocks.reached).toEqual(["GET /api/auth/magic-link/verify"]);
  });
});
