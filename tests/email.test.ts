import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailConfig, sendSignInEmail } from "@/lib/email";

const EMAIL = "person@example.com";
const LINK = "http://localhost:3000/api/auth/magic-link/verify?token=secret-token";
const KEY = "re_test_key";
const FROM = "Report Harmonizer <signin@example.com>";

function setEnv(nodeEnv: string | undefined, apiKey = "", from = "") {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("EMAIL_API_KEY", apiKey);
  vi.stubEnv("EMAIL_FROM", from);
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

describe("getEmailConfig", () => {
  it("fails in production when both settings are missing", () => {
    setEnv("production");
    expect(() => getEmailConfig()).toThrow("EMAIL_API_KEY and EMAIL_FROM must be set");
  });

  it("fails in production when EMAIL_FROM is missing", () => {
    setEnv("production", KEY);
    expect(() => getEmailConfig()).toThrow("EMAIL_FROM must be set");
  });

  it("fails in development when a key is set without EMAIL_FROM", () => {
    setEnv("development", KEY);
    expect(() => getEmailConfig()).toThrow("EMAIL_FROM must be set");
  });

  it("fails without a key when NODE_ENV is missing", () => {
    setEnv(undefined);
    expect(() => getEmailConfig()).toThrow("EMAIL_API_KEY and EMAIL_FROM must be set");
  });

  it("uses the terminal in development without a key", () => {
    setEnv("development");
    expect(getEmailConfig()).toEqual({ mode: "terminal" });
  });
});

describe("sendSignInEmail", () => {
  it("prints the link in development without a key, and sends nothing", async () => {
    setEnv("development");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await sendSignInEmail(EMAIL, LINK);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged()).toContain(LINK);
  });

  it("sends the email through Resend and prints nothing", async () => {
    setEnv("production", KEY, FROM);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ id: "1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendSignInEmail(EMAIL, LINK);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init!.body as string);
    expect(body).toMatchObject({
      from: FROM,
      to: EMAIL,
      subject: "Your sign-in link for Report Harmonizer",
    });
    expect(body.text).toContain(LINK);
    expect(body.text).toContain("expires in 15 minutes");
    expect(logged()).toBe("");
  });

  it("logs only an error code when Resend rejects the email", async () => {
    setEnv("production", KEY, FROM);
    const reply = { statusCode: 422, name: "validation_error", message: `Invalid to: ${EMAIL}` };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(reply), { status: 422 })),
    );

    await expect(sendSignInEmail(EMAIL, LINK)).rejects.toThrow();

    expect(logged()).toBe("EMAIL_SEND_FAILED status=422 code=validation_error");
  });

  it("logs only an error code when the network fails", async () => {
    setEnv("production", KEY, FROM);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));

    await expect(sendSignInEmail(EMAIL, LINK)).rejects.toThrow();

    expect(logged()).toBe("EMAIL_SEND_FAILED code=network");
  });
});
