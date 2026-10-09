import "server-only";

import path from "node:path";
import { Readable } from "node:stream";
import JSZip from "jszip";
import type { Edit, EditFlag, MeaningCheck, ParagraphResult } from "@/lib/harmonize";
import {
  type DocxParagraph,
  type DocxRun,
  MAX_DOCUMENT_XML_BYTES,
  parseDocumentXml,
  readDocumentXml,
} from "@/lib/read-docx";

// Turns Claude's edits into real Word tracked changes. Port of
// prototype/tracked_changes_engine.py, with these differences:
//   - edits are placed by their offset in the paragraph text, using the
//     paragraph reader's run positions, instead of searching for the text,
//   - an edit may cross several neighbouring runs if their formatting XML
//     is identical (Word often splits plain text into runs),
//   - comments are written here, not by an outside script,
//   - an edit that can't be placed safely is skipped and counted, instead
//     of stopping the whole file.
//
// Only document.xml changes, plus the comments part, its relationship and
// its content type when there are comments. Every other file in the .docx
// is kept as it was.
//
// Report text is confidential. This module never logs it and never puts
// it in an error message.

export const AUTHOR = "Report Harmonizer";
const INITIALS = "RH";

// The fixed part of each comment, by flag. No colons or dashes, like the
// edits themselves.
export const COMMENT_TEXT: Record<EditFlag, string> = {
  meaning: "Please check whether this edit changes the meaning.",
  punctuation: "Please check this edit. It adds a colon or dash, which your rules avoid.",
};

// Said instead of the general meaning sentence when one of harmonize's own
// meaning checks fired, so the comment says what to look at.
export const CHECK_TEXT: Record<MeaningCheck, string> = {
  numbers: "Please check the numbers. This edit adds, removes or changes a number.",
  negation:
    "Please check this edit. It adds or removes a word like not or never, which can turn the meaning around.",
  cause: "Please check this edit. It now says one thing causes another, which the original may not say.",
  quote: "Please check this edit. It changes a quote, which should stay word for word.",
};

// Claude's note goes into the comment, cut to at most this many characters.
export const MAX_NOTE_CHARS = 200;

export type SkipReason =
  | "paragraph_changed" // the paragraph's text isn't what Claude saw
  | "has_tracked_changes" // the paragraph already has tracked changes
  | "unsafe_text" // the new text has a line break, tab or invalid character
  | "not_plain_text" // a reference, text box, tab, break or similar
  | "in_field" // a field result, which Word rewrites on update
  | "crosses_formatting"; // runs with different formatting, or with something between them

export type WriteCounts = {
  written: number; // edits that are tracked changes in the file
  flagged: number; // written edits with a comment
  skipped: number;
  skipReasons: Partial<Record<SkipReason, number>>;
};

// Why writing failed. Safe to log: a fixed code, never text from the file.
export type DocxWriteReason =
  | "part_too_large" // a part unzips to more than the size limit
  | "part_unreadable" // a part couldn't be unzipped, or isn't UTF-8
  | "comments_malformed" // the comments part has no <w:comments> root
  | "comments_link_malformed" // the link to the comments part has no target
  | "relationships_malformed" // document.xml.rels has no <Relationships> root
  | "content_types_missing" // [Content_Types].xml isn't in the file
  | "content_types_malformed"; // [Content_Types].xml has no <Types> root

// The only error this module throws itself. The message is fixed on
// purpose, like the reader's; the reason says which check failed.
export class DocxWriteError extends Error {
  constructor(readonly reason: DocxWriteReason) {
    super("The harmonized document could not be written.");
    this.name = "DocxWriteError";
  }
}

export async function writeTrackedChanges(
  docx: Uint8Array,
  paragraphs: ParagraphResult[],
  now: Date,
): Promise<{ bytes: Buffer; counts: WriteCounts }> {
  const xml = await readDocumentXml(docx);
  const parsed = parseDocumentXml(xml);
  const counts: WriteCounts = { written: 0, flagged: 0, skipped: 0, skipReasons: {} };
  const skip = (reason: SkipReason, n = 1) => {
    counts.skipped += n;
    counts.skipReasons[reason] = (counts.skipReasons[reason] ?? 0) + n;
  };

  // Decide which edits can go in, before writing anything.
  const fields = fieldRanges(xml);
  const clusters: Cluster[] = [];
  for (const result of paragraphs) {
    if (result.status !== "changed" || result.edits.length === 0) continue;
    const paragraph = parsed[result.index];
    if (!paragraph || paragraph.text !== result.original) {
      skip("paragraph_changed", result.edits.length);
      continue;
    }
    if (TRACKED_CHANGE.test(xml.slice(paragraph.start, paragraph.end))) {
      skip("has_tracked_changes", result.edits.length);
      continue;
    }
    const placed: Placed[] = [];
    for (const edit of result.edits) {
      const outcome = placeEdit(xml, paragraph, edit, fields);
      if (typeof outcome === "string") skip(outcome);
      else placed.push(outcome);
    }
    clusters.push(...groupIntoClusters(paragraph, placed));
  }

  const written = clusters.flatMap((c) => c.edits);
  if (written.length === 0) return { bytes: Buffer.from(docx), counts };

  const zip = await JSZip.loadAsync(docx);
  const comments = await openComments(zip);

  // New ids start above every id already used, so they never clash with
  // the report's own tracked changes, comments or bookmarks.
  let lastId = Math.max(maxId(xml), maxId(comments.xml), ...(await otherIds(zip)));
  const nextId = () => ++lastId;
  const date = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const newComments: string[] = [];

  // Built in document order, so ids and comments follow the reading order.
  const replacements = clusters.map((cluster) =>
    buildCluster(xml, cluster, {
      date,
      nextId,
      addComment: (id, text) => newComments.push(commentXml(id, text, date)),
    }),
  );
  // Put in from the end of the document backwards, so the positions of
  // everything before stay correct.
  let out = xml;
  for (let i = clusters.length - 1; i >= 0; i--) {
    out = out.slice(0, clusters[i].start) + replacements[i] + out.slice(clusters[i].end);
  }

  counts.written = written.length;
  counts.flagged = written.filter((p) => p.edit.flags.length > 0).length;

  zip.file("word/document.xml", out);
  if (newComments.length > 0) await saveComments(zip, comments, newComments);

  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { bytes, counts };
}

// ---------------------------------------------------------------------------
// Placing edits

type Placed = { edit: Edit; first: number; last: number }; // run indexes

type Cluster = {
  paragraph: DocxParagraph;
  first: number;
  last: number;
  start: number; // the runs first..last are xml.slice(start, end)
  end: number;
  edits: Placed[];
};

// Any existing change mark: inserted, deleted or moved text, a changed
// paragraph mark, or changed formatting. "[\s>/]" keeps w:delText and
// w:moveFromRangeEnd from matching the wrong tag.
const TRACKED_CHANGE =
  /<w:(?:ins|del|moveFrom|moveTo|moveFromRangeStart|moveToRangeStart|rPrChange|pPrChange|sectPrChange|numberingChange)[\s>/]/;

function placeEdit(
  xml: string,
  paragraph: DocxParagraph,
  edit: Edit,
  fields: [number, number][],
): Placed | SkipReason {
  if (!isSafeText(edit.new)) return "unsafe_text";
  const start = edit.offset;
  const end = start + edit.old.length;
  if (edit.old === "" || paragraph.text.slice(start, end) !== edit.old) {
    return "paragraph_changed";
  }

  // The runs that overlap the edit. A run without text (a footnote
  // reference, a break) inside the edit counts too, and fails the plain
  // text check below. One exactly at the edit's edge is left out: the edit
  // doesn't touch it.
  const covered: number[] = [];
  paragraph.runs.forEach((run, i) => {
    if (run.textOffset < end && run.textOffset + run.text.length > start) covered.push(i);
  });
  if (covered.length === 0) return "paragraph_changed";
  const first = covered[0];
  const last = covered.at(-1)!;
  if (last - first + 1 !== covered.length) return "crosses_formatting";

  const runs = paragraph.runs.slice(first, last + 1);
  for (const run of runs) {
    if (!isPlainRun(xml, run)) return "not_plain_text";
    if (fields.some(([s, e]) => run.start > s && run.start < e)) return "in_field";
  }
  for (let i = 1; i < runs.length; i++) {
    // Same formatting, and nothing at all between them in the XML (no
    // bookmark, comment mark, hyperlink edge or spell-check mark).
    if (runs[i].propsXml !== runs[0].propsXml) return "crosses_formatting";
    if (runs[i].start !== runs[i - 1].end) return "crosses_formatting";
  }
  return { edit, first, last };
}

// A run that holds only its formatting and one piece of text: no tab,
// break, reference, field code, picture or text box.
const PLAIN_RUN_BODY = /^\s*<w:t(?:\s[^>]*)?>[^<]*<\/w:t>\s*$/;

function isPlainRun(xml: string, run: DocxRun): boolean {
  if (run.trackedChange || run.isReference || run.containsTextBox) return false;
  if (run.textElementCount !== 1) return false;
  const runXml = xml.slice(run.start, run.end);
  const open = openTag(runXml);
  if (open.endsWith("/>") || !runXml.endsWith("</w:r>")) return false;
  let body = runXml.slice(open.length, -"</w:r>".length).trimStart();
  if (run.propsXml) {
    if (!body.startsWith(run.propsXml)) return false;
    body = body.slice(run.propsXml.length);
  }
  return PLAIN_RUN_BODY.test(body);
}

// Characters that can't go in a w:t: control characters (XML forbids most
// of them, and Word shows a line break or tab inside a w:t as a space, so
// accepting the change wouldn't give the text Claude wrote), and half of
// an emoji or other character outside the basic range.
const UNSAFE_TEXT =
  /[\u0000-\u001F\u007F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function isSafeText(text: string): boolean {
  return !UNSAFE_TEXT.test(text);
}

// Where fields are in the document. A field's result (a cross-reference, a
// table of contents line, a page number) is rewritten by Word whenever the
// field updates, so an edit there would be lost. Complex fields can run
// across paragraphs, so this looks at the whole document.
function fieldRanges(xml: string): [number, number][] {
  const MARK =
    /<w:fldChar\b[^>]*?w:fldCharType="(begin|end)"[^>]*>|<w:fldSimple\b[^>]*?(\/)?>|<\/w:fldSimple>/g;
  const ranges: [number, number][] = [];
  let depth = 0;
  let start = 0;
  for (const m of xml.matchAll(MARK)) {
    const opens = m[1] === "begin" || (m[0].startsWith("<w:fldSimple") && !m[2]);
    const closes = m[1] === "end" || m[0] === "</w:fldSimple>";
    if (opens) {
      if (depth++ === 0) start = m.index;
    } else if (closes && depth > 0) {
      if (--depth === 0) ranges.push([start, m.index]);
    }
  }
  if (depth > 0) ranges.push([start, xml.length]);
  return ranges;
}

// Edits that share a run are written together, since the run is rebuilt
// once. Edits are sorted and never overlap, so run ranges only grow.
function groupIntoClusters(paragraph: DocxParagraph, placed: Placed[]): Cluster[] {
  const clusters: Cluster[] = [];
  for (const p of placed) {
    const current = clusters.at(-1);
    if (current && p.first <= current.last) {
      current.last = Math.max(current.last, p.last);
      current.edits.push(p);
    } else {
      clusters.push({ paragraph, first: p.first, last: p.last, start: 0, end: 0, edits: [p] });
    }
  }
  for (const c of clusters) {
    c.start = paragraph.runs[c.first].start;
    c.end = paragraph.runs[c.last].end;
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Writing the XML

type BuildOptions = {
  date: string;
  nextId: () => number;
  addComment: (id: number, text: string) => void;
};

function buildCluster(xml: string, cluster: Cluster, options: BuildOptions): string {
  const runs = cluster.paragraph.runs.slice(cluster.first, cluster.last + 1);
  const props = runs[0].propsXml; // the same for all of them
  const { date, nextId } = options;
  const attrs = () => `w:id="${nextId()}" w:author="${AUTHOR}" w:date="${date}"`;

  // Text between two positions in the paragraph, as copies of the original
  // runs it came from: same opening tag, same formatting.
  const copy = (from: number, to: number, tag: "t" | "delText") =>
    runs
      .map((run) => {
        const s = Math.max(from, run.textOffset);
        const e = Math.min(to, run.textOffset + run.text.length);
        if (s >= e) return "";
        const text = run.text.slice(s - run.textOffset, e - run.textOffset);
        return `${openTag(xml.slice(run.start, run.end))}${run.propsXml}${textElement(tag, text)}</w:r>`;
      })
      .join("");

  let out = "";
  let position = runs[0].textOffset;
  for (const { edit } of cluster.edits) {
    out += copy(position, edit.offset, "t");

    // Word by word, so only the words that changed show as changed.
    let middle = "";
    for (const op of diffWords(edit.old, edit.new)) {
      const from = edit.offset + op.oldStart;
      const to = edit.offset + op.oldEnd;
      if (op.equal) {
        middle += copy(from, to, "t");
        continue;
      }
      if (to > from) middle += `<w:del ${attrs()}>${copy(from, to, "delText")}</w:del>`;
      if (op.newText) {
        middle += `<w:ins ${attrs()}><w:r>${props}${textElement("t", op.newText)}</w:r></w:ins>`;
      }
    }

    if (edit.flags.length > 0) {
      const id = nextId();
      options.addComment(id, commentText(edit));
      middle =
        `<w:commentRangeStart w:id="${id}"/>${middle}<w:commentRangeEnd w:id="${id}"/>` +
        `<w:r><w:commentReference w:id="${id}"/></w:r>`;
    }
    out += middle;
    position = edit.offset + edit.old.length;
  }
  const last = runs.at(-1)!;
  out += copy(position, last.textOffset + last.text.length, "t");
  return out;
}

function commentText(edit: Edit): string {
  const sentences: string[] = [];
  if (edit.flags.includes("meaning")) {
    const checks = edit.checks ?? [];
    if (checks.length > 0) sentences.push(...checks.map((check) => CHECK_TEXT[check]));
    else sentences.push(COMMENT_TEXT.meaning);
  }
  if (edit.flags.includes("punctuation")) sentences.push(COMMENT_TEXT.punctuation);
  const note = edit.note
    .replace(/\s+/g, " ")
    .replace(new RegExp(UNSAFE_TEXT.source, "g"), "")
    .trim();
  return [...sentences, shorten(note, MAX_NOTE_CHARS)].filter(Boolean).join(" ");
}

// Cuts text to at most `max` characters, ending with "…" when it was cut.
// Counted in whole characters, so an emoji is never split in half.
function shorten(text: string, max: number): string {
  const characters = [...text];
  if (characters.length <= max) return text;
  return characters.slice(0, max - 1).join("").trimEnd() + "…";
}

function commentXml(id: number, text: string, date: string): string {
  return (
    `<w:comment w:id="${id}" w:author="${AUTHOR}" w:date="${date}" w:initials="${INITIALS}">` +
    `<w:p><w:r><w:annotationRef/></w:r><w:r>${textElement("t", text)}</w:r></w:p></w:comment>`
  );
}

function openTag(elementXml: string): string {
  return elementXml.slice(0, elementXml.indexOf(">") + 1);
}

function textElement(tag: "t" | "delText", text: string): string {
  return `<w:${tag} xml:space="preserve">${escapeXml(text)}</w:${tag}>`;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function maxId(xml: string | null): number {
  let max = 0;
  for (const m of xml?.matchAll(/\bw:id="(\d+)"/g) ?? []) max = Math.max(max, Number(m[1]));
  return max;
}

async function otherIds(zip: JSZip): Promise<number[]> {
  const ids: number[] = [];
  for (const name of ["word/footnotes.xml", "word/endnotes.xml"]) {
    ids.push(maxId(await readPart(zip, name)));
  }
  return ids;
}

// ---------------------------------------------------------------------------
// The comments part, its relationship and its content type

const RELS_PATH = "word/_rels/document.xml.rels";
const COMMENTS_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments";
const COMMENTS_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml";
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

type Comments = {
  path: string; // where the comments part is, or will be, in the zip
  xml: string | null; // its current content, if the report has one
  rels: string | null;
  hasRel: boolean;
};

async function openComments(zip: JSZip): Promise<Comments> {
  const rels = await readPart(zip, RELS_PATH);
  for (const m of rels?.matchAll(/<Relationship\b[^>]*>/g) ?? []) {
    if (attr(m[0], "Type") !== COMMENTS_REL) continue;
    const target = attr(m[0], "Target");
    if (!target) throw new DocxWriteError("comments_link_malformed");
    // Targets are relative to word/, or absolute from the zip's root.
    const partPath = target.startsWith("/")
      ? target.slice(1)
      : path.posix.normalize(path.posix.join("word", target));
    return { path: partPath, xml: await readPart(zip, partPath), rels, hasRel: true };
  }
  const partPath = "word/comments.xml";
  return { path: partPath, xml: await readPart(zip, partPath), rels, hasRel: false };
}

async function saveComments(zip: JSZip, comments: Comments, added: string[]): Promise<void> {
  if (comments.xml === null) {
    zip.file(
      comments.path,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="${W_NS}">${added.join("")}</w:comments>`,
    );
  } else {
    zip.file(
      comments.path,
      appendToRoot(comments.xml, "w:comments", added.join(""), "comments_malformed"),
    );
  }

  if (!comments.hasRel) {
    const target = path.posix.relative("word", comments.path);
    if (comments.rels === null) {
      zip.file(
        RELS_PATH,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${COMMENTS_REL}" Target="${target}"/></Relationships>`,
      );
    } else {
      const used = [...comments.rels.matchAll(/\bId="rId(\d+)"/g)].map((m) => Number(m[1]));
      const id = `rId${Math.max(0, ...used) + 1}`;
      zip.file(
        RELS_PATH,
        appendToRoot(
          comments.rels,
          "Relationships",
          `<Relationship Id="${id}" Type="${COMMENTS_REL}" Target="${target}"/>`,
          "relationships_malformed",
        ),
      );
    }
  }

  const types = await readPart(zip, "[Content_Types].xml");
  if (types === null) throw new DocxWriteError("content_types_missing");
  const partName = `/${comments.path}`;
  const listed = [...types.matchAll(/<Override\b[^>]*>/g)].some(
    (m) => attr(m[0], "PartName")?.toLowerCase() === partName.toLowerCase(),
  );
  if (!listed) {
    zip.file(
      "[Content_Types].xml",
      appendToRoot(
        types,
        "Types",
        `<Override PartName="${partName}" ContentType="${COMMENTS_CONTENT_TYPE}"/>`,
        "content_types_malformed",
      ),
    );
  }
}

// Adds `content` as the last children of a part's root element. An empty
// root may be written as one self-closing tag, like <w:comments .../> in a
// report whose comments were all deleted; it is opened up first.
function appendToRoot(
  xml: string,
  root: string,
  content: string,
  reason: DocxWriteReason,
): string {
  const close = xml.lastIndexOf(`</${root}>`);
  if (close !== -1) return xml.slice(0, close) + content + xml.slice(close);
  const empty = new RegExp(`<${root}(\\s[^>]*?)?\\s*/>`).exec(xml);
  if (!empty) throw new DocxWriteError(reason);
  return (
    xml.slice(0, empty.index) +
    `<${root}${empty[1] ?? ""}>${content}</${root}>` +
    xml.slice(empty.index + empty[0].length)
  );
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

// Reads a small part of the .docx as text, with the same size limit as the
// paragraph reader, counted while unzipping (see readDocumentXml).
async function readPart(zip: JSZip, name: string): Promise<string | null> {
  const entry = zip.file(name);
  if (!entry) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > MAX_DOCUMENT_XML_BYTES) throw new DocxWriteError("part_too_large");
      chunks.push(chunk);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch (error) {
    if (error instanceof DocxWriteError) throw error;
    throw new DocxWriteError("part_unreadable");
  } finally {
    stream.destroy();
  }
}

// ---------------------------------------------------------------------------
// Word-by-word diff. A port of the prototype's TOKEN pattern and of
// Python's difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes(),
// followed by the prototype's merge of a lone space between two changes.

// "u": an emoji is one token, never split in half.
const TOKEN = /\s+|[A-Za-z0-9$%’'\-–/]+|[^\sA-Za-z0-9]/gu;

type Opcode = ["equal" | "replace" | "delete" | "insert", number, number, number, number];

export type DiffOp = { equal: boolean; oldStart: number; oldEnd: number; newText: string };

// Positions are character offsets into `old`.
export function diffWords(old: string, next: string): DiffOp[] {
  const a = old.match(TOKEN) ?? [];
  const b = next.match(TOKEN) ?? [];
  const ops = mergeLoneSpaces(a, opcodes(a, b));

  const offsets = [0];
  for (const token of a) offsets.push(offsets.at(-1)! + token.length);
  return ops.map(([tag, i1, i2, j1, j2]) => ({
    equal: tag === "equal",
    oldStart: offsets[i1],
    oldEnd: offsets[i2],
    newText: b.slice(j1, j2).join(""),
  }));
}

function opcodes(a: string[], b: string[]): Opcode[] {
  const b2j = new Map<string, number[]>();
  b.forEach((token, j) => {
    const list = b2j.get(token);
    if (list) list.push(j);
    else b2j.set(token, [j]);
  });

  // difflib's find_longest_match: the longest run of equal tokens, the
  // earliest one in `a` if there's a tie.
  const longest = (alo: number, ahi: number, blo: number, bhi: number) => {
    let best: [number, number, number] = [alo, blo, 0];
    let j2len = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>();
      for (const j of b2j.get(a[i]) ?? []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) ?? 0) + 1;
        next.set(j, k);
        if (k > best[2]) best = [i - k + 1, j - k + 1, k];
      }
      j2len = next;
    }
    return best;
  };

  const blocks: [number, number, number][] = [];
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = longest(alo, ahi, blo, bhi);
    if (k === 0) continue;
    blocks.push([i, j, k]);
    if (alo < i && blo < j) queue.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
  }
  blocks.sort((x, y) => x[0] - y[0] || x[1] - y[1]);

  // Join blocks that touch, as difflib does.
  const joined: [number, number, number][] = [];
  for (const block of blocks) {
    const previous = joined.at(-1);
    if (previous && previous[0] + previous[2] === block[0] && previous[1] + previous[2] === block[1]) {
      previous[2] += block[2];
    } else {
      joined.push([...block]);
    }
  }
  joined.push([a.length, b.length, 0]);

  const ops: Opcode[] = [];
  let i = 0;
  let j = 0;
  for (const [ai, bj, size] of joined) {
    if (i < ai && j < bj) ops.push(["replace", i, ai, j, bj]);
    else if (i < ai) ops.push(["delete", i, ai, j, bj]);
    else if (j < bj) ops.push(["insert", i, ai, j, bj]);
    i = ai + size;
    j = bj + size;
    if (size > 0) ops.push(["equal", ai, i, bj, j]);
  }
  return ops;
}

// "make the  report" -> one change instead of two changes around a space
// that Word would show as an odd unchanged gap.
function mergeLoneSpaces(a: string[], ops: Opcode[]): Opcode[] {
  const merged = ops.map((op) => [...op] as Opcode);
  let i = 1;
  while (i < merged.length - 1) {
    const [tag, i1, i2] = merged[i];
    const previous = merged[i - 1];
    const next = merged[i + 1];
    if (
      tag === "equal" &&
      /^\s+$/.test(a.slice(i1, i2).join("")) &&
      previous[0] !== "equal" &&
      next[0] !== "equal"
    ) {
      merged.splice(i - 1, 3, ["replace", previous[1], next[2], previous[3], next[4]]);
      i = Math.max(i - 1, 1);
    } else {
      i++;
    }
  }
  return merged;
}
