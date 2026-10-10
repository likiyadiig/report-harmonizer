import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "@/lib/process-job";

// lib/process-job imports the database client, which this test doesn't use.
vi.mock("@/lib/db", () => ({ db: {} }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAnthropicClient", () => {
  it("uses the official address even when ANTHROPIC_BASE_URL points elsewhere", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://attacker.example.com");
    const client = createAnthropicClient("sk-ant-test");
    expect(client.baseURL).toBe("https://api.anthropic.com");
  });
});
