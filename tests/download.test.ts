import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-ins for sign-in and the database, so the route can be called
// directly. The job "table" is a plain array.
const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  jobs: [] as {
    id: string;
    userId: string;
    status: string;
    originalFilename: string | null;
    downloadedAt: Date | null;
  }[],
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => mocks.session } },
}));
vi.mock("@/lib/db", () => ({
  db: {
    job: {
      findFirst: async ({ where }: { where: { id: string; userId: string; status: string } }) =>
        mocks.jobs.find(
          (j) => j.id === where.id && j.userId === where.userId && j.status === where.status,
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { downloadedAt: Date } }) => {
        const job = mocks.jobs.find((j) => j.id === where.id)!;
        job.downloadedAt = data.downloadedAt;
        return job;
      },
    },
  },
}));

const { GET } = await import("@/app/jobs/[id]/download/route");
const { contentDisposition, downloadFilename } = await import("@/lib/download");

// Made-up bytes, not a real report. Written to a temporary folder outside
// the project and deleted afterwards.
const CONTENT = Buffer.from("not really a docx");
let uploadDir: string;

beforeAll(async () => {
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "download-test-"));
  vi.stubEnv("UPLOAD_DIR", uploadDir);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  mocks.session = { user: { id: "owner" } };
  mocks.jobs = [
    {
      id: "job1",
      userId: "owner",
      status: "done",
      originalFilename: "Test-report-Valdora.docx",
      downloadedAt: null,
    },
  ];
  await writeFile(path.join(uploadDir, "job1.harmonized.docx"), CONTENT);
});

function get(id: string) {
  return GET(new Request(`http://localhost/jobs/${id}/download`), {
    params: Promise.resolve({ id }),
  });
}

async function expectNotFound(response: Response) {
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Not found.");
}

describe("download route", () => {
  it("sends the file to the owner", async () => {
    const response = await get("job1");
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(CONTENT);
    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="Test-report-Valdora harmonized.docx"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.jobs[0].downloadedAt).toBeInstanceOf(Date);
  });

  it("gives not found with no session", async () => {
    mocks.session = null;
    await expectNotFound(await get("job1"));
    expect(mocks.jobs[0].downloadedAt).toBeNull();
  });

  it("gives the same not found for someone else's job as for no job", async () => {
    mocks.session = { user: { id: "someone-else" } };
    const theirs = await get("job1");
    const missing = await get("nosuchjob");
    expect(theirs.status).toBe(missing.status);
    expect(await theirs.text()).toBe(await missing.text());
    expect([...theirs.headers]).toEqual([...missing.headers]);
    await expectNotFound(await get("job1"));
    expect(mocks.jobs[0].downloadedAt).toBeNull();
  });

  it("gives not found for a job that isn't done", async () => {
    mocks.jobs[0].status = "processing";
    await expectNotFound(await get("job1"));
  });

  it("never lets the id choose a path", async () => {
    // Even if a job had this id, the path is checked before any file is read.
    mocks.jobs.push({
      id: "../job1.harmonized",
      userId: "owner",
      status: "done",
      originalFilename: "x.docx",
      downloadedAt: null,
    });
    await expectNotFound(await get("../../etc/passwd"));
    // harmonizedPath refuses the id, so no file is read and nothing is sent.
    const response = await get("../job1.harmonized");
    expect(response.status).toBe(303);
    expect(mocks.jobs.at(-1)!.downloadedAt).toBeNull();
  });

  it("sends the owner back to the job page when the file is missing", async () => {
    await rm(path.join(uploadDir, "job1.harmonized.docx"));
    const response = await get("job1");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/jobs/job1");
    expect(mocks.jobs[0].downloadedAt).toBeNull();
  });
});

describe("downloadFilename", () => {
  it("adds harmonized and keeps the original name as it is", () => {
    expect(downloadFilename("Test-report-Valdora.docx")).toBe(
      "Test-report-Valdora harmonized.docx",
    );
    expect(downloadFilename("Report.DOCX")).toBe("Report harmonized.docx");
  });

  it("removes characters that could break the header or the path", () => {
    expect(downloadFilename('a"b\\c/d\r\ne.docx')).toBe("abcde harmonized.docx");
  });

  it("falls back to a plain name", () => {
    expect(downloadFilename(null)).toBe("Report harmonized.docx");
    expect(downloadFilename(".docx")).toBe("Report harmonized.docx");
  });
});

describe("contentDisposition", () => {
  it("gives an ASCII name and the exact UTF-8 name", () => {
    expect(contentDisposition("Évaluation (draft) harmonized.docx")).toBe(
      `attachment; filename="_valuation (draft) harmonized.docx"; ` +
        `filename*=UTF-8''%C3%89valuation%20%28draft%29%20harmonized.docx`,
    );
  });
});
