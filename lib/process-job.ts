import "server-only";

import { writeFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import {
  CALL_TIMEOUT_MS,
  JOB_TIMEOUT_MS,
  MODEL,
  PROMPT_VERSION,
  getAnthropicKey,
  getUploadDir,
} from "@/lib/config";
import { HarmonizeError, harmonize, type Usage } from "@/lib/harmonize";
import { DocxReadError, readParagraphs } from "@/lib/read-docx";

// Runs one uploaded job: reads its paragraphs, gets Claude's edits and
// saves them next to the upload as <jobId>.edits.json. The database only
// gets the status, counts and token usage, never report text.
//
// It never throws: every failure ends with the job marked failed and a
// short, fixed reason on it.

// The results file. It holds report text, so it lives in the upload
// folder, readable only by the app, and is deleted with the upload.
export function resultPath(jobId: string): string {
  if (!/^[a-z0-9]+$/.test(jobId)) throw new Error("Invalid job id.");
  return path.join(getUploadDir(), `${jobId}.edits.json`);
}

type FailureCode =
  | HarmonizeError["code"]
  | "not_configured"
  | "unreadable"
  | "unexpected";

// What the user sees on a failed job.
const FAILURE_MESSAGES: Record<FailureCode, string> = {
  too_large: "This report is too long to harmonize in one go.",
  call_limit: "This report needed more work than one job allows.",
  job_timeout: "Harmonizing took too long. Please upload again.",
  refused: "Claude declined to edit part of this report.",
  bad_output: "Claude's answer couldn't be used. Please upload again.",
  api_error: "Claude couldn't be reached. Please upload again later.",
  not_configured: "The server isn't set up to harmonize reports yet.",
  unreadable: "This file couldn't be read as a Word document.",
  unexpected: "Something went wrong. Please upload again.",
};

export async function processJob(jobId: string): Promise<void> {
  // Only a queued job can move to processing, so a job never runs twice.
  // The model and prompt version are set again here, so the job records
  // what actually ran.
  const claimed = await db.job.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "processing", model: MODEL, promptVersion: PROMPT_VERSION },
  });
  if (claimed.count === 0) return;

  let usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  try {
    const apiKey = getAnthropicKey();
    if (!apiKey) throw new NotConfiguredError();

    const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
    const { paragraphs } = await readParagraphs(jobId);
    // Paragraphs that already have tracked changes are left alone, so the
    // report's existing changes stay untouched.
    const input = paragraphs
      .filter((p) => p.eligible)
      .map((p) => ({
        index: p.index,
        text: p.text,
        skip: p.runs.some((r) => r.trackedChange !== null),
      }));

    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: CALL_TIMEOUT_MS });
    const result = await harmonize(client, input, {
      jobId,
      model: MODEL,
      rules: job.rulesSnapshot,
      signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
      onProgress: async (progress) => {
        usage = progress.usage;
        await db.job.update({
          where: { id: jobId },
          data: {
            paragraphsDone: progress.paragraphsDone,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          },
        });
      },
    });
    usage = result.usage;

    await writeFile(
      resultPath(jobId),
      JSON.stringify({
        jobId,
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        paragraphs: result.paragraphs,
      }),
      { mode: 0o600 },
    );

    const { counts } = result;
    await db.job.update({
      where: { id: jobId },
      data: {
        status: "done",
        paragraphsDone: input.length,
        editsTotal: counts.edits,
        editsFlagged: counts.flagged,
        // The summary's "skipped" covers both edits that couldn't be placed
        // and paragraphs left alone because of existing tracked changes.
        editsSkipped: counts.skippedEdits + counts.skippedParagraphs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        finishedAt: new Date(),
      },
    });
    console.log(
      `JOB_DONE job=${jobId} paragraphs=${input.length} edits=${counts.edits} flagged=${counts.flagged} skipped_edits=${counts.skippedEdits} skipped_paragraphs=${counts.skippedParagraphs} calls=${usage.calls} in=${usage.inputTokens} out=${usage.outputTokens}`,
    );
  } catch (error) {
    if (error instanceof HarmonizeError) usage = error.usage;
    const code = failureCode(error);
    console.error(
      `JOB_FAILED job=${jobId} code=${code}${code === "unexpected" ? ` ${describeUnexpected(error)}` : ""} calls=${usage.calls} in=${usage.inputTokens} out=${usage.outputTokens}`,
    );
    try {
      await db.job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          error: FAILURE_MESSAGES[code],
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          finishedAt: new Date(),
        },
      });
    } catch {
      // Left at processing; the next server start marks it failed.
      console.error(`JOB_FAILED_UPDATE job=${jobId}`);
    }
  }
}

class NotConfiguredError extends Error {}

function failureCode(error: unknown): FailureCode {
  if (error instanceof HarmonizeError) return error.code;
  if (error instanceof NotConfiguredError) return "not_configured";
  if (error instanceof DocxReadError) return "unreadable";
  return "unexpected";
}

// The error's class and code only, never its message or stack: those
// could contain a file path or text from the report.
function describeUnexpected(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  return `error=${name}` + (typeof code === "string" ? ` (${code})` : "");
}
