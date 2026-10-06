// The short summary on a finished job, from the counts on the job row.
// Plain sentences with no colons or dashes, like the edits themselves.
// A part whose count is zero is left out.

export type SummaryCounts = {
  editsTotal: number; // tracked changes in the file
  editsFlagged: number; // of those, the ones with a comment
  editsSkipped: number; // edits and paragraphs left alone (see process-job.ts)
};

export function summaryText({ editsTotal, editsFlagged, editsSkipped }: SummaryCounts): string {
  const sentences: string[] = [];
  if (editsTotal > 0) {
    sentences.push(`${editsTotal} ${editsTotal === 1 ? "change" : "changes"} made.`);
  }
  if (editsFlagged > 0) {
    sentences.push(
      `${editsFlagged} ${editsFlagged === 1 ? "is" : "are"} marked for you to check.`,
    );
  }
  // "Parts", not "changes": editsSkipped counts both edits that couldn't be
  // placed safely and whole paragraphs that already had tracked changes.
  if (editsSkipped > 0) {
    sentences.push(
      `${editsSkipped} ${editsSkipped === 1 ? "part was" : "parts were"} left untouched to keep the document safe.`,
    );
  }
  if (editsTotal === 0) sentences.unshift("No changes were needed.");
  return sentences.join(" ");
}
