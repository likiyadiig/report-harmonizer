import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

// The startup cleanup of unfinished jobs needs a database.
vi.mock("@/lib/interrupted-jobs", () => ({ failInterruptedJobs: async () => 0 }));

// Every setting valid for production, so only the one each test changes
// can stop the server.
const VALID: Record<string, string> = {
  NEXT_RUNTIME: "nodejs",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@localhost:5432/harmonizer",
  BETTER_AUTH_SECRET: "a".repeat(64),
  BETTER_AUTH_URL: "https://harmonizer.example.com",
  EMAIL_API_KEY: "re_test",
  EMAIL_FROM: "Report Harmonizer <signin@example.com>",
  ALLOWED_EMAILS: "you@example.com",
  UPLOAD_DIR: "/var/lib/report-harmonizer/uploads",
  ANTHROPIC_API_KEY: "sk-ant-test",
};

let exit: ReturnType<typeof vi.spyOn>;
let logError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const [name, value] of Object.entries(VALID)) vi.stubEnv(name, value);
  // Stops register() where the real server would stop.
  exit = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit");
  });
  logError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("register in production", () => {
  it.each([
    ["missing", undefined],
    ["shorter than 32 characters", "a".repeat(31)],
  ])("stops with a clear message when BETTER_AUTH_SECRET is %s", async (_case, value) => {
    vi.stubEnv("BETTER_AUTH_SECRET", value);
    await expect(register()).rejects.toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(logError).toHaveBeenCalledWith(
      "BETTER_AUTH_SECRET must be set to a random string of at least 32 characters, for example the output of openssl rand -hex 32.",
    );
  });

  it.each([
    ["missing", undefined],
    ["not a Postgres address", "mysql://user:password@localhost:3306/harmonizer"],
  ])("stops with a clear message when DATABASE_URL is %s", async (_case, value) => {
    vi.stubEnv("DATABASE_URL", value);
    await expect(register()).rejects.toThrow("process.exit");
    expect(exit).toHaveBeenCalledWith(1);
    expect(logError).toHaveBeenCalledWith(
      "DATABASE_URL must be set to the Postgres connection string, starting with postgresql:// or postgres://.",
    );
  });
});
