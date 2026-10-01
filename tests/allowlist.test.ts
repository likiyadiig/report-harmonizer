import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canStartSession,
  getAllowlist,
  isEmailAllowed,
  sendSignInLinkIfAllowed,
} from "@/lib/allowlist";

const LISTED = "a@x.com";
const UNLISTED = "stranger@example.com";
const LINK = "http://localhost:3000/api/auth/magic-link/verify?token=secret-token";

function setEnv(nodeEnv: string | undefined, allowed: string | undefined) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("ALLOWED_EMAILS", allowed);
  vi.stubEnv("EMAIL_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Report Harmonizer <signin@example.com>");
}

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

// Everything written to the console during the test, as one string.
function logged(): string {
  return [...log.mock.calls, ...error.mock.calls].flat().join("\n");
}

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getAllowlist", () => {
  it("ignores case, spaces and empty entries", () => {
    setEnv("production", " A@x.com , b@Y.com,, ");
    expect(getAllowlist()).toEqual({ mode: "list", emails: new Set(["a@x.com", "b@y.com"]) });
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["only commas and spaces", " , ,"],
  ])("fails in production when the list is %s", (_, allowed) => {
    setEnv("production", allowed);
    expect(() => getAllowlist()).toThrow("ALLOWED_EMAILS must list at least one email address");
  });

  it.each([undefined, "test", "Development"])("fails when NODE_ENV is %s and the list is empty", (nodeEnv) => {
    setEnv(nodeEnv, "");
    expect(() => getAllowlist()).toThrow("ALLOWED_EMAILS must list at least one email address");
  });

  it("lets anyone sign in in development when the list is empty", () => {
    setEnv("development", "");
    expect(getAllowlist()).toEqual({ mode: "anyone" });
  });

  it.each(["a@x.com; b@y.com", "a@x.com b@y.com", "alice", "a@"])(
    "fails in development too on a bad entry: %s",
    (allowed) => {
      setEnv("development", allowed);
      expect(() => getAllowlist()).toThrow("entry 1 is not a single email address");
    },
  );
});

describe("isEmailAllowed", () => {
  it("ignores case and spaces in the address", () => {
    setEnv("production", LISTED);
    expect(isEmailAllowed("  A@X.com ")).toBe(true);
  });

  it.each(["a@x.co", "a@x.com.evil.com", "xa@x.com", ""])("rejects %j", (email) => {
    setEnv("production", LISTED);
    expect(isEmailAllowed(email)).toBe(false);
  });
});

describe("sendSignInLinkIfAllowed", () => {
  it("sends no email to an address not on the list, and logs only a code", async () => {
    setEnv("production", LISTED);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await sendSignInLinkIfAllowed(UNLISTED, LINK);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toBe("SIGN_IN_REFUSED code=not_allowed");
  });

  it("sends the email to an address on the list", async () => {
    setEnv("production", LISTED);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendSignInLinkIfAllowed(LISTED, LINK);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).to).toBe(LISTED);
    expect(logged()).toBe("");
  });
});

describe("canStartSession", () => {
  it("allows an address on the list", () => {
    setEnv("production", LISTED);
    expect(canStartSession(LISTED)).toBe(true);
    expect(logged()).toBe("");
  });

  it.each([UNLISTED, undefined])("refuses %s and logs only a code", (email) => {
    setEnv("production", LISTED);
    expect(canStartSession(email)).toBe(false);
    expect(logged()).toBe("SESSION_REFUSED code=not_allowed");
  });
});
