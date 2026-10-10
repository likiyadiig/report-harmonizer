import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInState } from "@/app/sign-in/actions";

// Stand-ins shared with the mocks below, so the tests can see what was called.
const mocks = vi.hoisted(() => ({
  signInMagicLink: vi.fn(),
  sendSignInEmail: vi.fn(),
  ip: "203.0.113.1",
}));

// The real auth library saves a Verification row and then calls the
// allowlist check. This stand-in does the same check without a database, so
// "Better Auth was called" stands for "a database row was written".
vi.mock("@/lib/auth", () => ({
  auth: { api: { signInMagicLink: mocks.signInMagicLink } },
}));
vi.mock("@/lib/email", async (original) => ({
  ...(await original<typeof import("@/lib/email")>()),
  sendSignInEmail: mocks.sendSignInEmail,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": mocks.ip }),
}));

const ON_LIST = "mom@example.com";
const OFF_LIST = "mom@exmaple.com";

function form(email: string): FormData {
  const data = new FormData();
  data.set("email", email);
  return data;
}

// A fresh copy of the action for each test, so the counts start at zero.
async function sendLink(email: string): Promise<SignInState> {
  const actions = await import("@/app/sign-in/actions");
  return actions.sendLink({ status: "idle" }, form(email));
}

// The visible text of a rendered page, without tags.
function visibleText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'");
}

// The message the form shows for the state the action returned.
async function shownFor(state: SignInState): Promise<string> {
  const { StatusMessage } = await import("@/app/sign-in/sign-in-form");
  return visibleText(renderToStaticMarkup(<StatusMessage status={state.status} />));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.ip = "203.0.113.1";
  mocks.signInMagicLink.mockImplementation(
    async ({ body }: { body: { email: string } }) => {
      const { sendSignInLinkIfAllowed } = await import("@/lib/allowlist");
      await sendSignInLinkIfAllowed(body.email, "http://localhost:3001/verify?token=t");
    },
  );
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("EMAIL_API_KEY", "");
  vi.stubEnv("ALLOWED_EMAILS", ON_LIST);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sign-in limits", () => {
  it("a 4th request for the same address within 10 minutes sends no email and says to try later", async () => {
    for (let i = 0; i < 3; i++) await sendLink(ON_LIST);
    expect(mocks.sendSignInEmail).toHaveBeenCalledTimes(3);

    const fourth = await sendLink(ON_LIST);
    expect(mocks.sendSignInEmail).toHaveBeenCalledTimes(3);
    expect(await shownFor(fourth)).toContain(
      "Too many attempts. Please try again in a few minutes.",
    );
  });

  it("gives an allowed and a not allowed address the same answer, normally and at the limit", async () => {
    mocks.ip = "203.0.113.1";
    const onFirst = await sendLink(ON_LIST);
    mocks.ip = "203.0.113.2";
    const offFirst = await sendLink(OFF_LIST);
    expect(offFirst).toEqual({ ...onFirst, email: OFF_LIST });

    mocks.ip = "203.0.113.1";
    await sendLink(ON_LIST);
    await sendLink(ON_LIST);
    const onLimited = await sendLink(ON_LIST);
    mocks.ip = "203.0.113.2";
    await sendLink(OFF_LIST);
    await sendLink(OFF_LIST);
    const offLimited = await sendLink(OFF_LIST);
    expect(offLimited).toEqual(onLimited);
  });

  it("creates no database row for a not allowed address", async () => {
    await sendLink(OFF_LIST);
    expect(mocks.signInMagicLink).not.toHaveBeenCalled();
  });
});

describe("sign-in page", () => {
  it("shows the expired link message after a failed link", async () => {
    const { default: SignIn } = await import("@/app/sign-in/page");
    const html = renderToStaticMarkup(
      await SignIn({ searchParams: Promise.resolve({ error: "INVALID_TOKEN" }) }),
    );
    expect(visibleText(html)).toContain(
      "This link has expired or was already used. Send yourself a new one.",
    );
  });
});

describe("sendLink input checks", () => {
  it("sends nothing for an empty email and asks for one", async () => {
    const state = await sendLink("   ");
    expect(mocks.signInMagicLink).not.toHaveBeenCalled();
    expect(mocks.sendSignInEmail).not.toHaveBeenCalled();
    expect(await shownFor(state)).toContain("Please type your email address.");
  });

  it("sends nothing for a badly formed email and asks for a valid one", async () => {
    const state = await sendLink("bob@");
    expect(mocks.signInMagicLink).not.toHaveBeenCalled();
    expect(mocks.sendSignInEmail).not.toHaveBeenCalled();
    expect(await shownFor(state)).toContain("Please type a valid email address.");
  });
});
