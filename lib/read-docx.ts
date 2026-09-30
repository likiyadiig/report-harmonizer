import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import JSZip from "jszip";
import { SaxesParser } from "saxes";
import { getUploadDir } from "@/lib/config";

// Reads a Word report's paragraphs, in document order. Port of
// prototype/read_report.py, with three deliberate fixes (see
// tests/read-docx.test.ts):
//   - a self-closing empty paragraph no longer swallows the next one,
//   - a text box is its own paragraph, counted once,
//   - a tab counts as a space, so the words on each side stay separate.
//
// Report text is confidential. This module only returns it: it never logs
// it, stores it, or puts it in an error message.

// Paragraphs shorter than this are headings, labels or short table cells,
// which the prototype leaves alone.
export const MIN_WORDS = 8;

// A big real report's document.xml is usually 2-15 MB. Anything over this
// is refused before it can use up the server's memory (see readDocumentXml).
export const MAX_DOCUMENT_XML_BYTES = 50 * 1024 * 1024;

export type DocxRun = {
  text: string;
  textOffset: number; // where this run's text starts inside paragraph.text
  start: number; // <w:r> ... </w:r> is documentXml.slice(start, end)
  end: number;
  propsXml: string; // the run's raw <w:rPr>...</w:rPr>, or "" if it has none
  trackedChange: "ins" | "del" | "moveFrom" | "moveTo" | null;
  textElementCount: number; // number of <w:t> elements in the run
  isReference: boolean; // footnote, endnote or comment reference
  containsTextBox: boolean; // the run holds a whole text box
};

export type DocxParagraph = {
  index: number; // position among ALL paragraphs, skipped ones included
  text: string; // visible text: existing insertions in, deletions out
  wordCount: number;
  eligible: boolean; // wordCount >= MIN_WORDS
  location: "body" | "table" | "textbox";
  start: number; // <w:p> ... </w:p> is documentXml.slice(start, end)
  end: number;
  runs: DocxRun[];
};

// The only errors this module throws. The messages are fixed on purpose: a
// library's own error message could quote part of the report.
export class DocxReadError extends Error {
  constructor(readonly code: "too_large" | "unreadable") {
    super(
      code === "too_large"
        ? "The document is too large to read."
        : "The file is not a readable Word document.",
    );
    this.name = "DocxReadError";
  }
}

export async function readParagraphs(
  jobId: string,
): Promise<{ paragraphs: DocxParagraph[] }> {
  // Job ids are cuids (lowercase letters and digits). Checking that means
  // an id can never point outside the upload folder, e.g. "../../x".
  if (!/^[a-z0-9]+$/.test(jobId)) throw new Error("Invalid job id.");
  const bytes = await readFile(path.join(getUploadDir(), `${jobId}.docx`));
  return parseDocx(bytes);
}

export async function parseDocx(
  bytes: Uint8Array,
  maxDocumentXmlBytes = MAX_DOCUMENT_XML_BYTES,
): Promise<{ paragraphs: DocxParagraph[] }> {
  const xml = await readDocumentXml(bytes, maxDocumentXmlBytes);
  return { paragraphs: parseDocumentXml(xml) };
}

// Unzips word/document.xml and decodes it as text. The tracked changes
// writer must read the file the same way, so that paragraph and run
// offsets point at the same characters.
export async function readDocumentXml(
  bytes: Uint8Array,
  maxBytes = MAX_DOCUMENT_XML_BYTES,
): Promise<string> {
  let entry: JSZip.JSZipObject | null;
  try {
    entry = (await JSZip.loadAsync(bytes)).file("word/document.xml");
  } catch {
    throw new DocxReadError("unreadable");
  }
  if (!entry) throw new DocxReadError("unreadable");

  // A "zip bomb" is a small zip that unpacks to gigabytes. The size a zip
  // declares for its contents can be faked, so instead we count the bytes
  // as they are unpacked, a chunk at a time, and stop at the limit.
  const chunks: Buffer[] = [];
  let total = 0;
  // jszip returns an old-style stream; wrap() turns it into a modern one we
  // can loop over. Destroying it stops the unzipping.
  const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > maxBytes) throw new DocxReadError("too_large");
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof DocxReadError) throw error;
    throw new DocxReadError("unreadable");
  } finally {
    stream.destroy();
  }

  try {
    // fatal: invalid UTF-8 is an error, like the prototype's decode('utf8').
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch {
    throw new DocxReadError("unreadable");
  }
}

// Wrappers Word puts around runs to mark an existing tracked change.
const TRACKED_CHANGE_TAGS = new Set(["w:ins", "w:del", "w:moveFrom", "w:moveTo"]);

type OpenParagraph = DocxParagraph & { parts: string[]; length: number };
type OpenRun = DocxRun & { paragraph: OpenParagraph; parts: string[] };

export function parseDocumentXml(xml: string): DocxParagraph[] {
  const parser = new SaxesParser({ position: true });
  const paragraphs: DocxParagraph[] = [];

  const elements: string[] = []; // names of the currently open elements
  const openParagraphs: OpenParagraph[] = [];
  const openRuns: OpenRun[] = [];
  const openChanges: DocxRun["trackedChange"][] = [];
  let propsStart = -1;
  let inText = false; // inside a <w:t>
  // Word stores each text box twice: a modern copy and, inside
  // <mc:Fallback>, a copy for old versions of Word. We read only the
  // modern one, so a text box isn't counted twice.
  let fallbackDepth = 0;

  const currentRun = () => {
    const run = openRuns.at(-1);
    // A run belongs to the paragraph it was opened in. Inside a text box
    // there is a newer, inner paragraph, and text there isn't the run's.
    return run && run.paragraph === openParagraphs.at(-1) ? run : undefined;
  };

  const addText = (text: string) => {
    const paragraph = openParagraphs.at(-1);
    if (!paragraph) return;
    paragraph.parts.push(text);
    paragraph.length += text.length;
    currentRun()?.parts.push(text);
  };

  parser.on("doctype", () => {
    // Real Word files never have one. A DOCTYPE can declare entities that
    // expand to huge amounts of text, so refuse it outright.
    throw new DocxReadError("unreadable");
  });

  parser.on("opentag", (tag) => {
    const name = tag.name;
    const parent = elements.at(-1);
    elements.push(name);

    if (name === "mc:Fallback") fallbackDepth++;
    if (fallbackDepth > 0) return;

    // Where this element starts. The parser's position is just after the
    // tag's closing ">", and "<" can't appear inside an attribute value.
    const end = parser.position;
    const start = xml.lastIndexOf("<", end - 1);

    if (name === "w:p") {
      // A paragraph opening inside a run means the run holds a text box.
      const run = currentRun();
      if (run) run.containsTextBox = true;

      const location = elements.includes("w:txbxContent")
        ? "textbox"
        : elements.includes("w:tbl")
          ? "table"
          : "body";
      const paragraph: OpenParagraph = {
        index: paragraphs.length,
        text: "",
        wordCount: 0,
        eligible: false,
        location,
        start,
        end: -1,
        runs: [],
        parts: [],
        length: 0,
      };
      // Pushed now, so paragraphs are numbered in the order they open.
      paragraphs.push(paragraph);
      openParagraphs.push(paragraph);
    } else if (name === "w:r") {
      const paragraph = openParagraphs.at(-1);
      if (!paragraph) return;
      openRuns.push({
        text: "",
        textOffset: paragraph.length,
        start,
        end: -1,
        propsXml: "",
        trackedChange: openChanges.at(-1) ?? null,
        textElementCount: 0,
        isReference: false,
        containsTextBox: false,
        paragraph,
        parts: [],
      });
    } else if (TRACKED_CHANGE_TAGS.has(name)) {
      openChanges.push(name.slice(2) as DocxRun["trackedChange"]);
    } else if (name === "w:rPr" && parent === "w:r") {
      propsStart = start;
    } else if (name === "w:t" && !tag.isSelfClosing) {
      inText = true;
      const run = currentRun();
      if (run) run.textElementCount++;
    } else if (name === "w:tab" && parent === "w:r") {
      // Fix: a tab between two words. The prototype drops it and glues the
      // words together. (A w:tab inside paragraph settings is a tab stop,
      // not a character, so only a w:tab directly in a run counts.)
      addText(" ");
    }
  });

  parser.on("text", (text) => {
    if (inText && fallbackDepth === 0) addText(text);
  });
  parser.on("cdata", (text) => {
    if (inText && fallbackDepth === 0) addText(text);
  });

  parser.on("closetag", (tag) => {
    const name = tag.name;
    elements.pop();

    if (name === "mc:Fallback") {
      fallbackDepth--;
      return;
    }
    if (fallbackDepth > 0) return;

    const end = parser.position;

    if (name === "w:p") {
      const paragraph = openParagraphs.pop()!;
      paragraph.end = end;
      paragraph.text = paragraph.parts.join("");
      // Same as Python's len(text.split()): runs of whitespace separate words.
      paragraph.wordCount = paragraph.text.split(/\s+/).filter(Boolean).length;
      paragraph.eligible = paragraph.wordCount >= MIN_WORDS;
    } else if (name === "w:r") {
      const run = openRuns.at(-1);
      if (!run || run.paragraph !== openParagraphs.at(-1)) return;
      openRuns.pop();
      run.end = end;
      run.text = run.parts.join("");
      // The prototype's test: its tracked changes engine never edits a run
      // whose XML mentions "Reference" (footnote, endnote and comment
      // reference marks, and their character styles).
      run.isReference = xml.slice(run.start, end).includes("Reference");
      run.paragraph.runs.push(run);
    } else if (TRACKED_CHANGE_TAGS.has(name)) {
      openChanges.pop();
    } else if (name === "w:rPr" && propsStart !== -1) {
      const run = currentRun();
      if (run) run.propsXml = xml.slice(propsStart, end);
      propsStart = -1;
    } else if (name === "w:t") {
      inText = false;
    }
  });

  try {
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof DocxReadError) throw error;
    // Malformed XML. The parser's message can quote the document, so it is
    // replaced, not passed on.
    throw new DocxReadError("unreadable");
  }

  // Return plain objects, without the parser's working fields.
  return paragraphs.map((p) => ({
    index: p.index,
    text: p.text,
    wordCount: p.wordCount,
    eligible: p.eligible,
    location: p.location,
    start: p.start,
    end: p.end,
    runs: p.runs.map((r) => ({
      text: r.text,
      textOffset: r.textOffset,
      start: r.start,
      end: r.end,
      propsXml: r.propsXml,
      trackedChange: r.trackedChange,
      textElementCount: r.textElementCount,
      isReference: r.isReference,
      containsTextBox: r.containsTextBox,
    })),
  }));
}
