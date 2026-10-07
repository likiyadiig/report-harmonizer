import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendLink } from "@/app/sign-in/actions";
import { SentMessage } from "@/app/sign-in/sign-in-form";

// The real auth library needs a database. This stand-in calls the same
// allowlist check the real one is set up with in lib/auth.ts.
vi.mock("@/lib/auth", async () => {
  const { sendSignInLinkIfAllowed } = await import("@/lib/allowlist");
  return {
    auth: {
      api: {
        signInMagicLink: ({ body }: { body: { email: string } }) =>
          sendSignInLinkIfAllowed(body.email, "http://localhost:3001/verify?token=t"),
      },
    },
  };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const ON_LIST = "Mom@Example.com";
const OFF_LIST = "mom@exmaple.com";

function form(email: string): FormData {
  const data = new FormData();
  data.set("email", email);
  return data;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("EMAIL_API_KEY", "");
  vi.stubEnv("ALLOWED_EMAILS", "mom@example.com");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendLink", () => {
  it("returns the address as typed", async () => {
    const state = await sendLink({ status: "idle" }, form(` ${ON_LIST} `));
    expect(state).toEqual({ status: "sent", email: ON_LIST });
  });

  it("answers the same whether or not the address is on the list", async () => {
    const on = await sendLink({ status: "idle" }, form(ON_LIST));
    const off = await sendLink({ status: "idle" }, form(OFF_LIST));
    expect(off).toEqual({ ...on, email: OFF_LIST });
  });
});

describe("SentMessage", () => {
  const html = renderToStaticMarkup(
    <SentMessage
      email="mary-jo@example.com"
      expiresMinutes={15}
      linkInTerminal={true}
      onChangeAddress={() => {}}
    />,
  );
  // The visible text, without tags or the address itself.
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace("mary-jo@example.com", "");

  it("shows the address, the delay, spam and a way back", () => {
    expect(html).toContain("mary-jo@example.com");
    expect(text).toContain("can take a minute");
    expect(text).toContain("spam folder");
    expect(text).toContain("expires in 15 minutes");
    expect(html).toMatch(/<button[^>]*>Use a different email address<\/button>/);
  });

  it("has no colons or dashes", () => {
    expect(text).not.toMatch(/[:\-–—]/);
  });
});
