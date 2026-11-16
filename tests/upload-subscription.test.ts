import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeDocx } from "./helpers/make-docx.mjs";

// Uploading needs an active subscription. The upload action must refuse
// everyone else itself, not only rely on the page hiding the form.

const mocks = vi.hoisted(() => ({
  // The signed-in user's row, or null when there is none.
  user: null as { subscriptionStatus: string } | null,
  lookedUp: [] as unknown[],
  jobsCreated: 0,
  background: 0,
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: async (args: unknown) => {
        mocks.lookedUp.push(args);
        return mocks.user;
      },
    },
    ruleSet: { findUnique: async () => null },
    job: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mocks.jobsCreated++;
        return { id: "job1", ...data };
      },
      update: async () => ({}),
      delete: async () => ({}),
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "user1" } }) } },
}));
vi.mock("@/lib/process-job", () => ({ processJob: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({
  after: () => {
    mocks.background++;
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

const { uploadReport } = await import("@/app/upload/actions");

const SUBSCRIBE =
  "Report Harmonizer costs 15 euros a month. Subscribe to upload your first report.";

const DOCUMENT_XML =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  "<w:p><w:r><w:t>This paragraph has more than enough words to be harmonized by the app.</w:t></w:r></w:p>" +
  "</w:body></w:document>";

let uploadDir: string;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  mocks.user = null;
  mocks.lookedUp = [];
  mocks.jobsCreated = 0;
  mocks.background = 0;
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "rh-upload-subscription-test-"));
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("UPLOAD_DIR", uploadDir);
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(uploadDir, { recursive: true, force: true });
});

async function uploadValidReport() {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(await makeDocx(DOCUMENT_XML))], "report.docx"));
  return uploadReport({ message: "" }, form);
}

describe("uploadReport without an active subscription", () => {
  it.each([
    ["free", { subscriptionStatus: "free" }],
    ["past_due", { subscriptionStatus: "past_due" }],
    ["canceled", { subscriptionStatus: "canceled" }],
    ["no user row", null],
  ])("refuses %s: no job, no file, nothing sent to Claude", async (_, user) => {
    mocks.user = user;

    const state = await uploadValidReport();

    expect(state.message).toBe(SUBSCRIBE);
    expect(mocks.jobsCreated).toBe(0);
    expect(mocks.background).toBe(0);
    expect(await readdir(uploadDir)).toEqual([]);
    expect(log.mock.calls.flat().join("\n")).toBe("UPLOAD_REFUSED code=not_subscribed");
  });

  it("looks up the signed-in user's own status", async () => {
    mocks.user = { subscriptionStatus: "free" };
    await uploadValidReport();
    expect(mocks.lookedUp).toEqual([
      { where: { id: "user1" }, select: { subscriptionStatus: true } },
    ]);
  });
});

describe("uploadReport with an active subscription", () => {
  it("uploads, starts the job and goes to the job page", async () => {
    mocks.user = { subscriptionStatus: "active" };

    await expect(uploadValidReport()).rejects.toThrow("redirect to /jobs/job1");

    expect(mocks.jobsCreated).toBe(1);
    expect(mocks.background).toBe(1);
    expect(await readdir(uploadDir)).toEqual(["job1.docx"]);
  });
});
