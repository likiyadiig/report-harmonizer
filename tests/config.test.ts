import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAuthUrl, DEV_UPLOAD_DIR, getAnthropicKey, getUploadDir } from "@/lib/config";

const OUTSIDE = path.resolve(process.cwd(), "..", "rh-uploads");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getUploadDir", () => {
  it("uses UPLOAD_DIR when it is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPLOAD_DIR", OUTSIDE);
    expect(getUploadDir()).toBe(OUTSIDE);
  });

  it("uses the temp folder in development when UPLOAD_DIR is empty", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPLOAD_DIR", "");
    expect(getUploadDir()).toBe(DEV_UPLOAD_DIR);
  });

  it.each([
    ["production", undefined],
    ["production", ""],
    [undefined, ""],
    ["test", ""],
    ["Development", ""],
  ])("fails when NODE_ENV is %s and UPLOAD_DIR is %j", (nodeEnv, dir) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("UPLOAD_DIR", dir);
    expect(() => getUploadDir()).toThrow("UPLOAD_DIR must be set");
  });

  it("fails on a relative path", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPLOAD_DIR", "uploads");
    expect(() => getUploadDir()).toThrow("UPLOAD_DIR must be an absolute path.");
  });

  it.each([process.cwd(), path.join(process.cwd(), "uploads")])(
    "fails on a path inside the project folder: %s",
    (dir) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("UPLOAD_DIR", dir);
      expect(() => getUploadDir()).toThrow("UPLOAD_DIR must be outside the project folder.");
    },
  );
});

describe("checkAuthUrl", () => {
  it("accepts an https address in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://harmonizer.example.com");
    expect(() => checkAuthUrl()).not.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["http", "http://harmonizer.example.com"],
    ["without a scheme", "harmonizer.example.com"],
    ["not an address", "https://"],
  ])("fails in production when BETTER_AUTH_URL is %s", (_, value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", value);
    expect(() => checkAuthUrl()).toThrow("BETTER_AUTH_URL must be set to the app's https:// address");
  });

  it.each([undefined, "test", "Development"])("fails when NODE_ENV is %s and BETTER_AUTH_URL is http", (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    expect(() => checkAuthUrl()).toThrow("BETTER_AUTH_URL must be set");
  });

  it.each([undefined, "http://localhost:3000"])("allows %s in development", (value) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BETTER_AUTH_URL", value);
    expect(() => checkAuthUrl()).not.toThrow();
  });
});

describe("getAnthropicKey", () => {
  it("returns the key when it is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(getAnthropicKey()).toBe("sk-ant-test");
  });

  it.each([
    ["production", undefined],
    ["production", ""],
    [undefined, ""],
    ["test", ""],
    ["Development", ""],
  ])("fails when NODE_ENV is %s and ANTHROPIC_API_KEY is %j", (nodeEnv, key) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ANTHROPIC_API_KEY", key);
    expect(() => getAnthropicKey()).toThrow("ANTHROPIC_API_KEY must be set");
  });

  it("may be empty in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(getAnthropicKey()).toBeUndefined();
  });
});
