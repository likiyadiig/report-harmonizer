import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JobPage from "@/app/jobs/[id]/page";
import { JOB_TIMEOUT_MS } from "@/lib/config";

// A stand-in for the database that keeps Job rows in memory.
type FakeJob = Record<string, unknown> & { id: string; userId: string; status: string };
const jobs = new Map<string, FakeJob>();
vi.mock("@/lib/db", () => ({
  db: {
    job: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const job = jobs.get(where.id);
        return job && job.userId === where.userId ? { ...job } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: { in: string[] } };
        data: object;
      }) => {
        const job = jobs.get(where.id);
        if (!job || !where.status.in.includes(job.status)) return { count: 0 };
        jobs.set(job.id, { ...job, ...data });
        return { count: 1 };
      },
    },
  },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "user1" } }) } },
}));
vi.mock("@/lib/download", () => ({ harmonizedFileExists: async () => false }));
// The auto refresh needs the browser's router, which isn't there in a test.
vi.mock("@/app/jobs/[id]/auto-refresh", () => ({ AutoRefresh: () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

function addProcessingJob(uploadedMsAgo: number) {
  jobs.set("job1", {
    id: "job1",
    userId: "user1",
    status: "processing",
    originalFilename: "report.docx",
    error: null,
    createdAt: new Date(Date.now() - uploadedMsAgo),
    finishedAt: null,
    paragraphsTotal: 10,
  });
}

async function renderJobPage(): Promise<string> {
  return renderToStaticMarkup(await JobPage({ params: Promise.resolve({ id: "job1" }) }));
}

beforeEach(() => {
  jobs.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("JobPage", () => {
  it("shows a processing job that started longer ago than the time limit as failed", async () => {
    addProcessingJob(JOB_TIMEOUT_MS + 6 * 60_000);
    const html = await renderJobPage();
    expect(html).toContain("<dd>failed</dd>");
    expect(html).toContain("This took too long. Please upload again.");
  });

  it("still shows a processing job that started recently as processing", async () => {
    addProcessingJob(60_000);
    const html = await renderJobPage();
    expect(html).toContain("<dd>processing</dd>");
  });
});
