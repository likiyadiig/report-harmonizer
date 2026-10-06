import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { applyEdits, type ParagraphResult } from "@/lib/harmonize";
import { parseDocumentXml, readDocumentXml } from "@/lib/read-docx";
import {
  AUTHOR,
  COMMENT_TEXT,
  diffWords,
  DocxWriteError,
  writeTrackedChanges,
} from "@/lib/write-tracked-changes";
import { acceptAll, docxProblems, rejectAll } from "./helpers/docx-checks";
import { makeDocx } from "./helpers/make-docx.mjs";

// All fixtures are made-up text built in memory. No .docx is committed.

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const NOW = new Date("2026-10-06T14:03:27.512Z");
const DATE = "2026-10-06T14:03:27Z";

function doc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
}
function p(...runs: string[]): string {
  return `<w:p>${runs.join("")}</w:p>`;
}
function r(text: string, props = "", attrs = ""): string {
  return `<w:r${attrs}>${props}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}
// A .docx with exactly the given parts, for tests that need more than
// makeDocx's minimum.
async function buildDocx(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(parts)) zip.file(name, content);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
// With no entries, both are written as one self-closing tag.
function contentTypes(overrides = ""): string {
  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/content-types"';
  const defaults = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>';
  return `<?xml version="1.0" encoding="UTF-8"?><Types ${ns}>${defaults}${overrides}</Types>`;
}
function relationships(entries = ""): string {
  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return entries
    ? `<?xml version="1.0" encoding="UTF-8"?><Relationships ${ns}>${entries}</Relationships>`
    : `<?xml version="1.0" encoding="UTF-8"?><Relationships ${ns}/>`;
}
const BOLD = "<w:rPr><w:b/></w:rPr>";
const ITALIC = "<w:rPr><w:i/></w:rPr>";

type RawEdit = { paragraph: number; old: string; new: string; risk?: string; note?: string };

// Runs the writer the way the app does: the edits go through harmonize's
// own placing and flagging first.
async function run(documentXml: string, edits: RawEdit[], docx?: Buffer) {
  const input = docx ?? (await makeDocx(documentXml));
  const paragraphs = parseDocumentXml(await readDocumentXml(input));
  const touched = [...new Set(edits.map((e) => e.paragraph))];
  const batch = touched.map((index) => ({ index, text: paragraphs[index].text }));
  const results: ParagraphResult[] = applyEdits(
    batch,
    edits.map((e) => ({ risk: "none", note: "", ...e })) as Parameters<typeof applyEdits>[1],
  ).paragraphs;
  const { bytes, counts } = await writeTrackedChanges(input, results, NOW);
  const zip = await JSZip.loadAsync(bytes);
  const outXml = await zip.file("word/document.xml")!.async("string");
  return { input, bytes, counts, zip, outXml, results, before: paragraphs };
}

const texts = (xml: string) => parseDocumentXml(xml).map((p) => p.text);

// The three checks every written file must pass: a valid .docx, "accept
// all" gives exactly the revised text, "reject all" exactly the original.
async function expectRoundTrip(out: Awaited<ReturnType<typeof run>>) {
  expect(await docxProblems(out.bytes)).toEqual([]);
  const revised = out.before.map(
    (p) => out.results.find((r) => r.index === p.index && r.status === "changed")?.revised ?? p.text,
  );
  expect(texts(acceptAll(out.outXml))).toEqual(revised);
  expect(texts(rejectAll(out.outXml))).toEqual(out.before.map((p) => p.text));
}

describe("writing tracked changes", () => {
  it("turns an edit into a tracked change by Report Harmonizer, with the date", async () => {
    const xml = doc(p(r("The team will utilize the data to inform the next phase of work.")));
    const out = await run(xml, [{ paragraph: 0, old: "will utilize the data", new: "will use the data" }]);

    expect(out.counts).toEqual({ written: 1, flagged: 0, skipped: 0, skipReasons: {} });
    await expectRoundTrip(out);
    // Only the changed word is marked, not the whole phrase.
    expect(out.outXml).toContain(
      `<w:del w:id="1" w:author="${AUTHOR}" w:date="${DATE}"><w:r><w:delText xml:space="preserve">utilize</w:delText></w:r></w:del>`,
    );
    expect(out.outXml).toContain(
      `<w:ins w:id="2" w:author="${AUTHOR}" w:date="${DATE}"><w:r><w:t xml:space="preserve">use</w:t></w:r></w:ins>`,
    );
    expect(AUTHOR).toBe("Report Harmonizer");
  });

  it("keeps the run's formatting and attributes on every piece", async () => {
    const xml = doc(p(r("The team will utilize the data to inform the next phase.", ITALIC, ' w:rsidR="00AB12CD"')));
    const out = await run(xml, [{ paragraph: 0, old: "utilize", new: "use" }]);

    await expectRoundTrip(out);
    const pieces = [...out.outXml.matchAll(/<w:r\b[^>]*>(.*?)<\/w:r>/g)];
    expect(pieces).toHaveLength(4); // before, deleted, inserted, after
    for (const piece of pieces) expect(piece[1]).toContain(ITALIC);
    expect(out.outXml).toContain('<w:r w:rsidR="00AB12CD"><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">The team will </w:t></w:r>');
  });

  it("writes several edits in one paragraph and across paragraphs", async () => {
    const xml = doc(
      p(r("First, the team will utilize the data in order to inform the next phase.")) +
        p(r("Short heading")) +
        p(r("The evaluation found that the programme had a number of strengths overall.")),
    );
    const out = await run(xml, [
      { paragraph: 0, old: "First, the", new: "The" },
      { paragraph: 0, old: "utilize", new: "use" },
      { paragraph: 0, old: "in order to", new: "to" },
      { paragraph: 2, old: "had a number of strengths", new: "had several strengths" },
    ]);
    expect(out.counts.written).toBe(4);
    await expectRoundTrip(out);
    // The untouched paragraph keeps its exact XML.
    expect(out.outXml).toContain(p(r("Short heading")));
  });

  it("handles special characters, emoji and Windows line endings", async () => {
    const xml = doc(
      `\r\n${p(r("Costs &amp; benefits were &lt;not&gt; reviewed 🌍 by the team in each region."))}\r\n`,
    );
    const out = await run(xml, [
      { paragraph: 0, old: "Costs & benefits were <not> reviewed 🌍", new: "Costs & benefits were not reviewed 🌎" },
    ]);
    expect(out.counts.written).toBe(1);
    await expectRoundTrip(out);
    expect(out.outXml).toContain("Costs &amp; benefits were ");
    expect(out.outXml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document')).toBe(true);
  });

  it("starts its ids above every id already in the document", async () => {
    const xml = doc(
      p('<w:bookmarkStart w:id="41" w:name="x"/>', r("The team will utilize the data to inform the next phase."), '<w:bookmarkEnd w:id="41"/>'),
    );
    const out = await run(xml, [{ paragraph: 0, old: "utilize", new: "use", risk: "possible" }]);
    await expectRoundTrip(out);
    expect(out.outXml).toContain('<w:del w:id="42"');
    expect(out.outXml).toContain('<w:ins w:id="43"');
    expect(out.outXml).toContain('<w:commentRangeStart w:id="44"/>');
  });

  it("returns the file unchanged when there is nothing to write", async () => {
    const xml = doc(p(r("The team will utilize the data to inform the next phase.")));
    const out = await run(xml, []);
    expect(out.bytes.equals(out.input)).toBe(true);
    expect(out.counts).toEqual({ written: 0, flagged: 0, skipped: 0, skipReasons: {} });
  });
});

describe("neighbouring runs with identical formatting", () => {
  it("writes an edit that crosses runs Word split for no visible reason", async () => {
    const xml = doc(
      p(
        r("The team will util", BOLD, ' w:rsidR="00000001"'),
        r("ize the data to", BOLD, ' w:rsidR="00000002"'),
        r(" inform the next phase.", BOLD, ' w:rsidR="00000003"'),
      ),
    );
    const out = await run(xml, [{ paragraph: 0, old: "utilize the data to inform", new: "use the data to shape" }]);
    expect(out.counts).toMatchObject({ written: 1, skipped: 0 });
    await expectRoundTrip(out);
    // The deleted word keeps both of its original runs, each with its own
    // attributes and the shared formatting.
    expect(out.outXml).toMatch(
      /<w:del [^>]*><w:r w:rsidR="00000001"><w:rPr><w:b\/><\/w:rPr><w:delText xml:space="preserve">util<\/w:delText><\/w:r><w:r w:rsidR="00000002"><w:rPr><w:b\/><\/w:rPr><w:delText xml:space="preserve">ize<\/w:delText><\/w:r><\/w:del>/,
    );
    expect(out.outXml).toContain('<w:r w:rsidR="00000003"><w:rPr><w:b/></w:rPr><w:t xml:space="preserve"> the next phase.</w:t></w:r>');
  });

  it("writes two edits that share a run and cross a split", async () => {
    const xml = doc(p(r("The team will utilize the data in order"), r(" to inform the next phase of work.")));
    const out = await run(xml, [
      { paragraph: 0, old: "utilize", new: "use" },
      { paragraph: 0, old: "in order to inform", new: "to inform" },
      { paragraph: 0, old: "phase of work", new: "phase" },
    ]);
    expect(out.counts.written).toBe(3);
    await expectRoundTrip(out);
  });

  it("skips an edit across runs with different formatting, like a bold word", async () => {
    const xml = doc(p(r("The team will "), r("utilize", BOLD), r(" the data to inform the next phase.")));
    const out = await run(xml, [{ paragraph: 0, old: "will utilize the", new: "will use the" }]);
    expect(out.counts).toEqual({ written: 0, flagged: 0, skipped: 1, skipReasons: { crosses_formatting: 1 } });
    expect(out.bytes.equals(out.input)).toBe(true);
  });

  it("skips an edit across runs with something between them", async () => {
    const xml = doc(
      p(r("The team will util"), '<w:bookmarkStart w:id="1" w:name="b"/>', r("ize the data to inform the next phase.")),
    );
    const out = await run(xml, [{ paragraph: 0, old: "utilize", new: "use" }]);
    expect(out.counts.skipReasons).toEqual({ crosses_formatting: 1 });
    expect(out.bytes.equals(out.input)).toBe(true);
  });

  it("skips the unsafe edit but still writes the safe one in the same paragraph", async () => {
    const xml = doc(p(r("The team will "), r("utilize", BOLD), r(" the data in order to inform the next phase.")));
    const out = await run(xml, [
      { paragraph: 0, old: "will utilize the", new: "will use the" },
      { paragraph: 0, old: "in order to", new: "to" },
    ]);
    expect(out.counts).toMatchObject({ written: 1, skipped: 1 });
    expect(await docxProblems(out.bytes)).toEqual([]);
    expect(texts(rejectAll(out.outXml))).toEqual(out.before.map((p) => p.text));
    // The bold word is exactly as it was.
    expect(out.outXml).toContain(r("utilize", BOLD));
    // "accept all" gives the text with only the safe edit.
    expect(texts(acceptAll(out.outXml))[0]).toBe("The team will utilize the data to inform the next phase.");
  });
});

describe("edits that are skipped", () => {
  // Each one must leave the file exactly as it was.
  async function expectSkipped(xml: string, edit: RawEdit, reason: string) {
    const out = await run(xml, [edit]);
    expect(out.counts).toEqual({ written: 0, flagged: 0, skipped: 1, skipReasons: { [reason]: 1 } });
    expect(out.bytes.equals(out.input)).toBe(true);
  }
  const SENTENCE = "The team will utilize the data to inform the next phase.";

  it("skips text around a footnote reference", async () => {
    await expectSkipped(
      doc(p(r("The team will utilize"), '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="2"/></w:r>', r(" the data to inform the next phase."))),
      { paragraph: 0, old: "utilize the data", new: "use the data" },
      "not_plain_text",
    );
  });

  it("still writes an edit that ends right at a footnote reference", async () => {
    const out = await run(
      doc(p(r("The team will utilize"), '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="2"/></w:r>', r(" the data to inform the next phase."))),
      [{ paragraph: 0, old: "utilize", new: "use" }],
    );
    expect(out.counts.written).toBe(1);
    await expectRoundTrip(out);
    expect(out.outXml).toContain('<w:footnoteReference w:id="2"/>');
  });

  it("skips a run that holds a tab as well as text", async () => {
    await expectSkipped(
      doc(p(`<w:r><w:tab/><w:t xml:space="preserve">${SENTENCE}</w:t></w:r>`)),
      { paragraph: 0, old: "utilize", new: "use" },
      "not_plain_text",
    );
  });

  it("skips a reference run", async () => {
    await expectSkipped(
      doc(p(r(SENTENCE, '<w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>'))),
      { paragraph: 0, old: "utilize", new: "use" },
      "not_plain_text",
    );
  });

  it("skips a field result, which Word would rewrite", async () => {
    await expectSkipped(
      doc(
        p(
          '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> REF _Ref1 \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>',
          r(SENTENCE),
          '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
        ),
      ),
      { paragraph: 0, old: "utilize", new: "use" },
      "in_field",
    );
  });

  it("skips a simple field's result", async () => {
    await expectSkipped(
      doc(p(`<w:fldSimple w:instr=" REF _Ref1 ">${r(SENTENCE)}</w:fldSimple>`)),
      { paragraph: 0, old: "utilize", new: "use" },
      "in_field",
    );
  });

  it("leaves a paragraph with existing tracked changes untouched", async () => {
    await expectSkipped(
      doc(p(r(SENTENCE), '<w:ins w:id="1" w:author="Someone" w:date="2026-01-01T00:00:00Z"><w:r><w:t xml:space="preserve"> Added.</w:t></w:r></w:ins>')),
      { paragraph: 0, old: "utilize", new: "use" },
      "has_tracked_changes",
    );
  });

  it("leaves a paragraph with a tracked formatting change untouched", async () => {
    await expectSkipped(
      doc(p(r(SENTENCE, '<w:rPr><w:b/><w:rPrChange w:id="1" w:author="Someone" w:date="2026-01-01T00:00:00Z"><w:rPr/></w:rPrChange></w:rPr>'))),
      { paragraph: 0, old: "utilize", new: "use" },
      "has_tracked_changes",
    );
  });

  it("skips new text with a line break, which Word would show as a space", async () => {
    await expectSkipped(doc(p(r(SENTENCE))), { paragraph: 0, old: "utilize", new: "use\nmore" }, "unsafe_text");
  });

  it("skips a paragraph whose text isn't what Claude saw", async () => {
    const input = await makeDocx(doc(p(r(SENTENCE))));
    const results: ParagraphResult[] = [
      {
        index: 0,
        original: "Some other text the team wrote to inform the next phase.",
        revised: "Some other text the team wrote to shape the next phase.",
        status: "changed",
        edits: [{ offset: 31, old: "inform", new: "shape", flags: [], note: "" }],
      },
    ];
    const { bytes, counts } = await writeTrackedChanges(input, results, NOW);
    expect(counts.skipReasons).toEqual({ paragraph_changed: 1 });
    expect(bytes.equals(input)).toBe(true);
  });
});

describe("comments on flagged edits", () => {
  const SENTENCE = "The team will utilize the data and the programme was good overall.";

  async function commentsOf(out: Awaited<ReturnType<typeof run>>) {
    const xml = await out.zip.file("word/comments.xml")!.async("string");
    return [...xml.matchAll(/<w:comment\b[^>]*>.*?<w:t(?: [^>]*)?>(.*?)<\/w:t>.*?<\/w:comment>/g)].map((m) => m[1]);
  }

  it("adds one comment per flagged edit, worded by flag, with Claude's note", async () => {
    const out = await run(doc(p(r(SENTENCE))), [
      { paragraph: 0, old: "utilize", new: "use" }, // not flagged
      { paragraph: 0, old: "was good", new: "was sound", risk: "possible", note: "Softer word." },
    ]);
    expect(out.counts).toMatchObject({ written: 2, flagged: 1 });
    await expectRoundTrip(out);
    expect(await commentsOf(out)).toEqual([`${COMMENT_TEXT.meaning} Softer word.`]);
    expect(COMMENT_TEXT.meaning).toBe("Please check whether this edit changes the meaning.");
    const comments = await out.zip.file("word/comments.xml")!.async("string");
    expect(comments).toContain(`w:author="Report Harmonizer" w:date="${DATE}" w:initials="RH"`);
  });

  it("words a punctuation flag differently, and puts both sentences before one note", async () => {
    const out = await run(doc(p(r(SENTENCE))), [
      { paragraph: 0, old: "will utilize the data", new: "will do one thing: use the data", note: "Shorter." },
      { paragraph: 0, old: "was good overall", new: "was good: overall", risk: "possible", note: "Clearer.\n" },
    ]);
    await expectRoundTrip(out);
    expect(await commentsOf(out)).toEqual([
      "Please check this edit. It adds a colon or dash, which your rules avoid. Shorter.",
      "Please check whether this edit changes the meaning. Please check this edit. It adds a colon or dash, which your rules avoid. Clearer.",
    ]);
  });

  it("has no colons or dashes in the fixed comment text", () => {
    for (const text of Object.values(COMMENT_TEXT)) expect(text).not.toMatch(/[:\-–—]/);
  });

  it("adds to a report's existing comments and keeps every other part as it was", async () => {
    const documentXml = doc(
      p('<w:commentRangeStart w:id="0"/>', r("An earlier sentence that already has a reviewer comment on it."), '<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>') +
        p(r(SENTENCE)),
    );
    const existingComment = `<w:comment w:id="0" w:author="Reviewer" w:date="2026-01-01T00:00:00Z" w:initials="R"><w:p><w:r><w:t>Earlier note.</w:t></w:r></w:p></w:comment>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Normal"/></w:styles>`;
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>',
    );
    zip.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>';
    zip.file("word/_rels/document.xml.rels", rels);
    zip.file("word/document.xml", documentXml);
    zip.file("word/styles.xml", styles);
    zip.file("word/comments.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments ${W}>${existingComment}</w:comments>`);
    const input = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    const out = await run(documentXml, [{ paragraph: 1, old: "was good", new: "was sound", risk: "possible", note: "Softer." }], input);
    await expectRoundTrip(out);

    const comments = await out.zip.file("word/comments.xml")!.async("string");
    expect(comments).toContain(existingComment);
    expect(await commentsOf(out)).toEqual(["Earlier note.", `${COMMENT_TEXT.meaning} Softer.`]);
    expect(await out.zip.file("word/styles.xml")!.async("string")).toBe(styles);
    expect(await out.zip.file("word/_rels/document.xml.rels")!.async("string")).toBe(rels);
    // The first paragraph, with its reviewer comment, is exactly as it was.
    expect(out.outXml.slice(0, out.before[0].end)).toBe(documentXml.slice(0, out.before[0].end));
  });

  // A report whose comments were all deleted can keep an empty comments
  // part written as one self-closing tag. This failed with DocxWriteError
  // before, on a made-up test report.
  it("adds to an empty comments part written as a self-closing tag", async () => {
    const documentXml = doc(p(r(SENTENCE)));
    const emptyComments = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ${W}/>`;
    const input = await buildDocx({
      "[Content_Types].xml": contentTypes('<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'),
      "word/_rels/document.xml.rels": relationships('<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>'),
      "word/document.xml": documentXml,
      "word/comments.xml": emptyComments,
    });

    const out = await run(documentXml, [{ paragraph: 0, old: "was good", new: "was sound", risk: "possible", note: "Softer." }], input);
    expect(out.counts).toMatchObject({ written: 1, flagged: 1 });
    await expectRoundTrip(out);
    expect(await commentsOf(out)).toEqual([`${COMMENT_TEXT.meaning} Softer.`]);
    // The root keeps its namespaces; only its children are new.
    expect(await out.zip.file("word/comments.xml")!.async("string")).toMatch(
      new RegExp(`^<\\?xml[^>]*\\?><w:comments xmlns:r="[^"]*" ${W}><w:comment `),
    );
  });

  it("adds the link to an empty relationships part written as a self-closing tag", async () => {
    const documentXml = doc(p(r(SENTENCE)));
    const input = await buildDocx({
      "[Content_Types].xml": contentTypes(),
      "word/_rels/document.xml.rels": relationships(),
      "word/document.xml": documentXml,
    });
    const out = await run(documentXml, [{ paragraph: 0, old: "was good", new: "was sound", risk: "possible" }], input);
    await expectRoundTrip(out);
    expect(await out.zip.file("word/_rels/document.xml.rels")!.async("string")).toContain(
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>',
    );
  });

  it("fails with a fixed reason, not text, when a part can't be used", async () => {
    const documentXml = doc(p(r(SENTENCE)));
    const edit = [{ paragraph: 0, old: "was good", new: "was sound", risk: "possible" }];
    const failure = async (parts: Record<string, string>) => {
      const error = await run(documentXml, edit, await buildDocx({ "word/document.xml": documentXml, ...parts })).catch((e) => e);
      expect(error).toBeInstanceOf(DocxWriteError);
      expect(error.message).toBe("The harmonized document could not be written.");
      return error.reason;
    };
    expect(await failure({})).toBe("content_types_missing");
    expect(await failure({ "[Content_Types].xml": "<NotTypes/>" })).toBe("content_types_malformed");
    expect(await failure({ "[Content_Types].xml": contentTypes(), "word/comments.xml": "<w:other/>" })).toBe("comments_malformed");
    expect(await failure({ "[Content_Types].xml": contentTypes(), "word/_rels/document.xml.rels": "<Other/>" })).toBe("relationships_malformed");
  });

  it("creates the comments part, its link and its content type when the report has none", async () => {
    const out = await run(doc(p(r(SENTENCE))), [{ paragraph: 0, old: "was good", new: "was sound", risk: "possible" }]);
    await expectRoundTrip(out);
    expect(await commentsOf(out)).toEqual([COMMENT_TEXT.meaning]);
    expect(await out.zip.file("word/_rels/document.xml.rels")!.async("string")).toContain('Target="comments.xml"');
    expect(await out.zip.file("[Content_Types].xml")!.async("string")).toContain('PartName="/word/comments.xml"');
  });
});

describe("diffWords", () => {
  it("marks only the words that changed, like the prototype", () => {
    const ops = diffWords("We utilize the data", "We use the data");
    expect(ops.map((o) => [o.equal, "We utilize the data".slice(o.oldStart, o.oldEnd), o.newText])).toEqual([
      [true, "We ", "We "],
      [false, "utilize", "use"],
      [true, " the data", " the data"],
    ]);
  });

  it("joins two changes around a lone space into one", () => {
    const ops = diffWords("in order to make", "so as to build");
    expect(ops.filter((o) => !o.equal)).toHaveLength(2);
    expect(diffWords("a big red car", "a small blue car").filter((o) => !o.equal)).toEqual([
      { equal: false, oldStart: 2, oldEnd: 9, newText: "small blue" },
    ]);
  });
});
