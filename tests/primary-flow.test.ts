import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptAll, rejectAll } from "./helpers/docx-checks";

// The primary flow in one place: upload, harmonize, download. Sign-in, the
// database and Claude are stand-ins; the upload action, the job runner, the
// tracked changes writer and the download route are the real code.

const OLD_TEXT = "Training went well.";
const NEW_TEXT = "The training went well.";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  jobs: new Map<string, Record<string, unknown>>(),
  // Work the upload action hands to after(), run by the test.
  background: [] as (() => unknown)[],
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => mocks.session } },
}));

// A stand-in for the database that keeps Job rows in memory.
vi.mock("@/lib/db", () => {
  const matches = (job: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => job[key] === value);
  return {
    db: {
      ruleSet: { findUnique: async () => null },
      job: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const job = { id: "job1", ...data };
          mocks.jobs.set(job.id, job);
          return job;
        },
        update: async ({ where, data }: { where: { id: string }; data: object }) => {
          const job = { ...mocks.jobs.get(where.id), ...data };
          mocks.jobs.set(where.id, job);
          return job;
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: object }) => {
          let count = 0;
          for (const [id, job] of mocks.jobs) {
            if (!matches(job, where)) continue;
            mocks.jobs.set(id, { ...job, ...data });
            count++;
          }
          return { count };
        },
        delete: async ({ where }: { where: { id: string } }) => {
          const job = mocks.jobs.get(where.id);
          mocks.jobs.delete(where.id);
          return job;
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const job = mocks.jobs.get(where.id);
          if (!job) throw new Error("not found");
          return job;
        },
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          [...mocks.jobs.values()].find((job) => matches(job, where)) ?? null,
      },
    },
  };
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", () => ({
  after: (task: () => unknown) => {
    mocks.background.push(task);
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

// A fake Claude: the real SDK, except that sending a message returns one
// fixed edit for the paragraph holding OLD_TEXT, and no edits otherwise.
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic extends actual.default {
    constructor(options: ConstructorParameters<typeof actual.default>[0]) {
      super(options);
      this.messages = {
        create: async (body: Anthropic.MessageCreateParamsNonStreaming) => {
          const { paragraphs } = JSON.parse(body.messages[0].content as string) as {
            paragraphs: { id: number; text: string }[];
          };
          const target = paragraphs.find((p) => p.text.includes(OLD_TEXT));
          const edits = target
            ? [{ paragraph: target.id, old: OLD_TEXT, new: NEW_TEXT, risk: "none", note: "plainer" }]
            : [];
          return {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: body.model,
            content: [{ type: "text", text: JSON.stringify({ edits }), citations: null }],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 100, output_tokens: 40 },
          };
        },
      } as unknown as typeof this.messages;
    }
  }
  return { ...actual, default: FakeAnthropic };
});

const { uploadReport } = await import("@/app/upload/actions");
const { GET } = await import("@/app/jobs/[id]/download/route");

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SAMPLE = path.join(import.meta.dirname, "../public/samples/sample-report-before.docx");

const USER_A = { user: { id: "usera" } };
const USER_B = { user: { id: "userb" } };

let uploadDir: string;

beforeEach(async () => {
  mocks.session = null;
  mocks.jobs.clear();
  mocks.background = [];
  uploadDir = await mkdtemp(path.join(os.tmpdir(), "rh-primary-flow-test-"));
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("UPLOAD_DIR", uploadDir);
  // A placeholder, not a real key. The fake client never sends it anywhere.
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-not-real");
  // Nothing in this test may reach the network.
  vi.stubGlobal("fetch", () => {
    throw new Error("fetch called in a test");
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(uploadDir, { recursive: true, force: true });
});

async function upload(name: string, bytes: Buffer) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name));
  return uploadReport({ message: "" }, form);
}

// User A uploads the sample and the job runs to the end. Returns the job id.
async function uploadSampleAsUserA(): Promise<string> {
  mocks.session = USER_A;
  await expect(upload("sample-report-before.docx", await readFile(SAMPLE))).rejects.toThrow(
    "redirect to /jobs/job1",
  );
  for (const task of mocks.background) await task();
  return "job1";
}

function download(id: string) {
  return GET(new Request(`http://localhost/jobs/${id}/download`), {
    params: Promise.resolve({ id }),
  });
}

// The text of document.xml, without the markup.
function plainText(xml: string): string {
  return xml.replace(/<[^>]*>/g, "");
}

describe("primary flow", () => {
  it("uploads, harmonizes, and sends user A the report with the edit tracked", async () => {
    const id = await uploadSampleAsUserA();

    expect(mocks.jobs.get(id)?.status).toBe("done");
    const harmonized = path.join(uploadDir, `${id}.harmonized.docx`);
    const onDisk = await readFile(harmonized);

    const response = await download(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(DOCX_TYPE);
    const downloaded = Buffer.from(await response.arrayBuffer());
    expect(downloaded).toEqual(onDisk);

    const zip = await JSZip.loadAsync(downloaded);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    expect(documentXml).toMatch(/<w:ins\b/);
    expect(documentXml).toMatch(/<w:del\b/);
    expect(plainText(acceptAll(documentXml))).toContain(NEW_TEXT);
    expect(plainText(rejectAll(documentXml))).toContain(OLD_TEXT);
    expect(plainText(rejectAll(documentXml))).not.toContain(NEW_TEXT);
  });

  it("gives user B not found for user A's download, with no file contents", async () => {
    const id = await uploadSampleAsUserA();
    const onDisk = await readFile(path.join(uploadDir, `${id}.harmonized.docx`));

    mocks.session = USER_B;
    const response = await download(id);
    expect(response.status).toBe(404);
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.toString()).toBe("Not found.");
    expect(body.includes(onDisk.subarray(0, 64))).toBe(false);
  });

  it("gives not found with no session", async () => {
    const id = await uploadSampleAsUserA();

    mocks.session = null;
    const response = await download(id);
    expect(response.status).toBe(404);
  });

  it("turns away a text file renamed to .docx and creates no job", async () => {
    mocks.session = USER_A;
    const state = await upload(
      "report.docx",
      Buffer.from("This is plain text pretending to be a Word document.\n"),
    );

    expect(state.message).toBe(
      "This file isn't a valid Word document, even though it ends in .docx.",
    );
    expect(mocks.jobs.size).toBe(0);
    expect(await readdir(uploadDir)).toEqual([]);
  });
});
