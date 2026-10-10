import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadReport } from "@/app/upload/actions";
import { makeDocx } from "./helpers/make-docx.mjs";

// A stand-in for the database that keeps Job rows in memory, so the test
// can see which rows are left.
const jobs = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/db", () => ({
  db: {
    ruleSet: { findUnique: async () => null },
    job: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const job = { id: "job1", ...data };
        jobs.set(job.id, job);
        return job;
      },
      update: async ({ where, data }: { where: { id: string }; data: object }) => {
        const job = { ...jobs.get(where.id), ...data };
        jobs.set(where.id, job);
        return job;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const job = jobs.get(where.id);
        jobs.delete(where.id);
        return job;
      },
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "user1" } }) } },
}));
vi.mock("@/lib/process-job", () => ({ processJob: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

// Saving writes the first half of the file, then fails, as on a full disk.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: async (file: string, data: Buffer, options: object) => {
      await actual.writeFile(file, data.subarray(0, data.length / 2), options);
      throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
    },
  };
});

const DOCUMENT_XML =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
  "<w:p><w:r><w:t>This paragraph has more than enough words to be harmonized by the app.</w:t></w:r></w:p>" +
  "</w:body></w:document>";

let uploadDir: string;

beforeEach(async () => {
  jobs.clear();
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "rh-upload-test-"));
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("UPLOAD_DIR", uploadDir);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(uploadDir, { recursive: true, force: true });
});

describe("uploadReport", () => {
  it("leaves neither the job row nor any part of the file when saving fails", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(await makeDocx(DOCUMENT_XML))], "report.docx"));

    await uploadReport({ message: "" }, form);

    expect(jobs.size).toBe(0);
    expect(await readdir(uploadDir)).toEqual([]);
  });
});
