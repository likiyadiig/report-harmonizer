import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-ins for sign-in, the database and Next's redirect/notFound, so the
// action can be called directly. The job "table" is a plain array.
const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  jobs: [] as { id: string; userId: string; status: string }[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => mocks.session } },
}));
vi.mock("@/lib/db", () => ({
  db: {
    job: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        mocks.jobs.find((j) => j.id === where.id && j.userId === where.userId) ?? null,
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const before = mocks.jobs.length;
        mocks.jobs = mocks.jobs.filter((j) => !(j.id === where.id && j.userId === where.userId));
        return { count: before - mocks.jobs.length };
      },
    },
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

const { deleteJob } = await import("@/app/jobs/[id]/actions");

// Made-up bytes, not a real report. Written to a temporary folder outside
// the project and deleted afterwards.
const CONTENT = Buffer.from("not really a docx");
const FILES = ["job1.docx", "job1.edits.json", "job1.harmonized.docx", "job1.harmonized.docx.tmp"];
let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "delete-job-test-"));
  vi.stubEnv("UPLOAD_DIR", uploadDir);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  mocks.session = { user: { id: "owner" } };
  mocks.jobs = [{ id: "job1", userId: "owner", status: "done" }];
  for (const name of FILES) await writeFile(path.join(uploadDir, name), CONTENT);
});

async function exists(name: string): Promise<boolean> {
  try {
    await access(path.join(uploadDir, name));
    return true;
  } catch {
    return false;
  }
}

describe("deleteJob", () => {
  it("lets the owner delete a done job and sends them home with a message", async () => {
    await expect(deleteJob("job1")).rejects.toThrow("redirect to /?deleted=1");
    expect(mocks.jobs).toEqual([]);
  });

  it("lets the owner delete a failed job", async () => {
    mocks.jobs[0].status = "failed";
    await expect(deleteJob("job1")).rejects.toThrow("redirect to /?deleted=1");
    expect(mocks.jobs).toEqual([]);
  });

  it("removes every file of the job from disk", async () => {
    await expect(deleteJob("job1")).rejects.toThrow("redirect to /?deleted=1");
    for (const name of FILES) expect(await exists(name), name).toBe(false);
  });

  it("gives another user not found and leaves the job and its files alone", async () => {
    mocks.session = { user: { id: "someone-else" } };
    await expect(deleteJob("job1")).rejects.toThrow("not found");
    expect(mocks.jobs).toHaveLength(1);
    for (const name of FILES) expect(await exists(name), name).toBe(true);
  });

  it("gives not found for a job that doesn't exist", async () => {
    await expect(deleteJob("nosuchjob")).rejects.toThrow("not found");
  });

  it("sends someone who isn't signed in to sign in, deleting nothing", async () => {
    mocks.session = null;
    await expect(deleteJob("job1")).rejects.toThrow("redirect to /sign-in");
    expect(mocks.jobs).toHaveLength(1);
  });

  it("still deletes the row when files are already missing", async () => {
    await rm(path.join(uploadDir, "job1.harmonized.docx"));
    await rm(path.join(uploadDir, "job1.edits.json"));
    await rm(path.join(uploadDir, "job1.harmonized.docx.tmp"));
    await expect(deleteJob("job1")).rejects.toThrow("redirect to /?deleted=1");
    expect(mocks.jobs).toEqual([]);
    expect(await exists("job1.docx")).toBe(false);
  });

  it("still deletes the row when no file is left at all", async () => {
    for (const name of FILES) await rm(path.join(uploadDir, name));
    await expect(deleteJob("job1")).rejects.toThrow("redirect to /?deleted=1");
    expect(mocks.jobs).toEqual([]);
  });

  it.each(["queued", "processing"])("refuses a %s job, which is still running", async (status) => {
    mocks.jobs[0].status = status;
    await expect(deleteJob("job1")).rejects.toThrow("redirect to /jobs/job1");
    expect(mocks.jobs).toHaveLength(1);
    for (const name of FILES) expect(await exists(name), name).toBe(true);
  });
});
