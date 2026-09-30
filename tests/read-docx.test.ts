import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterAll, describe, expect, it } from "vitest";
import {
  DocxReadError,
  parseDocx,
  readDocumentXml,
  readParagraphs,
} from "@/lib/read-docx";
import { makeDocx } from "./helpers/make-docx.mjs";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

// Wraps paragraphs in the minimum document.xml around them.
function doc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
}

async function paragraphsOf(documentXml: string) {
  return (await parseDocx(await makeDocx(documentXml))).paragraphs;
}

// word-made: real Word output. handwritten: content types the Word one
// doesn't have (hyperlink, field, content control, accented letters, a
// paragraph over 100 characters).
describe.each(["word-made", "handwritten"])("parity with prototype/read_report.py: %s", (name) => {
  it("prints the same lines as the Python prototype", async () => {
    const expectedFile = path.join(FIXTURES, "parity", name, "python-output.txt");
    if (!existsSync(expectedFile)) {
      throw new Error(
        `Missing tests/fixtures/parity/${name}/python-output.txt. Generate it with:\n` +
          "  npm run fixture:build\n" +
          `  python3 prototype/read_report.py <printed ${name}.docx path> > tests/fixtures/parity/${name}/python-output.txt`,
      );
    }
    const xml = await readFile(path.join(FIXTURES, "parity", name, "document.xml"), "utf8");
    const paragraphs = await paragraphsOf(xml);

    // Python: print(i, text[:100]). Python slices by character, so split
    // the text into characters rather than JavaScript string units.
    const actual = paragraphs
      .filter((p) => p.eligible)
      .map((p) => `${p.index} ${Array.from(p.text).slice(0, 100).join("")}`)
      .join("\n");
    const expected = (await readFile(expectedFile, "utf8")).trimEnd();
    expect(actual).toBe(expected);
  });
});

describe("deliberate differences from the prototype", () => {
  it("does not let a self-closing empty paragraph swallow the next one", async () => {
    // Python's regex <w:p[ >].*?</w:p> starts at <w:p w:rsidR="..."/> and
    // runs on to the NEXT paragraph's </w:p>, merging the two. Every later
    // index is then off by one. Python gives: [0 "Seven words ..."].
    // A bare <w:p/> (no attributes) isn't matched by Python at all, so
    // Python doesn't count it. We count both kinds as empty paragraphs.
    const paragraphs = await paragraphsOf(
      doc(
        '<w:p w:rsidR="00B1"/>' +
          "<w:p><w:r><w:t>Seven words here and then one more word.</w:t></w:r></w:p>" +
          "<w:p/>" +
          "<w:p><w:r><w:t>Another paragraph that is long enough to be edited.</w:t></w:r></w:p>",
      ),
    );
    expect(paragraphs.map((p) => [p.index, p.text, p.eligible])).toEqual([
      [0, "", false],
      [1, "Seven words here and then one more word.", true],
      [2, "", false],
      [3, "Another paragraph that is long enough to be edited.", true],
    ]);
  });

  it("reads a text box once, as its own paragraph", async () => {
    // Word nests a text box paragraph inside the paragraph it's anchored
    // to, and stores it twice: once in <mc:Choice> and again in
    // <mc:Fallback> for old versions of Word. Python's regex stops the
    // outer paragraph at the box's </w:p>, reads the box text twice, and
    // loses the outer text after the box. Python gives:
    //   0 "The outer paragraph starts here, before the box. Text inside the box ..."
    //   1 "Text inside the box ..."   (the Fallback copy)
    // and "and it carries on ..." is never read.
    const box =
      "<w:txbxContent><w:p><w:r><w:t>Text inside the box has more than eight words in it.</w:t></w:r></w:p></w:txbxContent>";
    const paragraphs = await paragraphsOf(
      doc(
        '<w:p><w:r><w:t xml:space="preserve">The outer paragraph starts here, before the box. </w:t></w:r>' +
          '<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><a:graphic><a:graphicData><wps:wsp><wps:txbx>' +
          box +
          "</wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>" +
          "<mc:Fallback><w:pict><v:shape><v:textbox>" +
          box +
          "</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>" +
          "<w:r><w:t>And it carries on after the box.</w:t></w:r></w:p>",
      ),
    );
    expect(paragraphs.map((p) => [p.index, p.location, p.text])).toEqual([
      [
        0,
        "body",
        "The outer paragraph starts here, before the box. And it carries on after the box.",
      ],
      [1, "textbox", "Text inside the box has more than eight words in it."],
    ]);
    // The run holding the box must never be edited: its XML contains a
    // different paragraph.
    expect(paragraphs[0].runs.map((r) => r.containsTextBox)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("treats a tab as a space between words", async () => {
    // Python drops <w:tab/>, so "Region<tab>The pilot" becomes
    // "RegionThe pilot": 7 words, skipped. With the tab as a space it's 8
    // words, so the paragraph is edited. A <w:tab> inside <w:tabs> is a
    // tab stop setting, not a character, and adds nothing.
    const paragraphs = await paragraphsOf(
      doc(
        '<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>' +
          "<w:r><w:t>Region</w:t><w:tab/><w:t>The pilot ran in six small towns.</w:t></w:r></w:p>",
      ),
    );
    expect(paragraphs[0].text).toBe("Region The pilot ran in six small towns.");
    expect(paragraphs[0].wordCount).toBe(8);
    expect(paragraphs[0].eligible).toBe(true);
    expect(paragraphs[0].runs[0].textElementCount).toBe(2);
  });
});

describe("run-level details for the tracked changes writer", async () => {
  const xml = await readFile(path.join(FIXTURES, "parity/handwritten/document.xml"), "utf8");
  const bytes = await makeDocx(xml);
  const documentXml = await readDocumentXml(bytes);
  const { paragraphs } = await parseDocx(bytes);

  it("records offsets that cut each paragraph and run out of the XML exactly", () => {
    for (const p of paragraphs) {
      const pXml = documentXml.slice(p.start, p.end);
      expect(pXml).toMatch(/^<w:p[ >/]/);
      expect(pXml).toMatch(/(<\/w:p>|\/>)$/);
      for (const r of p.runs) {
        const rXml = documentXml.slice(r.start, r.end);
        expect(rXml).toMatch(/^<w:r[ >]/);
        expect(rXml.endsWith("</w:r>")).toBe(true);
        // Each run's text sits at textOffset inside the paragraph's text.
        expect(p.text.slice(r.textOffset, r.textOffset + r.text.length)).toBe(r.text);
      }
    }
  });

  it("marks existing tracked changes, references and formatting", () => {
    const visited = paragraphs.find((p) => p.text.startsWith("The evaluation team"))!;
    expect(
      visited.runs.map((r) => [r.text, r.trackedChange, r.isReference, r.textElementCount]),
    ).toEqual([
      ["The evaluation team visited ", null, false, 1],
      ["twelve ", "ins", false, 1],
      ["", "del", false, 0], // deleted text is in <w:delText>, not read
      ["partner schools during the spring of the final year.", null, false, 1],
      ["", null, true, 0], // footnote reference mark
    ]);

    const summary = paragraphs.find((p) => p.text.startsWith("The Riverbend"))!;
    expect(summary.runs[1].propsXml).toBe("<w:rPr><w:b/></w:rPr>");
    expect(summary.runs[0].propsXml).toBe("");
    expect(summary.text).toContain("four districts & reached families that the county’s earlier \"reading hour\"");
  });

  it("knows which paragraphs are in a table", () => {
    const share = paragraphs.find((p) => p.text.startsWith("Share of enrolled"))!;
    expect(share.location).toBe("table");
    expect(paragraphs[0].location).toBe("body");
  });
});

describe("safety", () => {
  const errorCode = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(DocxReadError);
      return (error as DocxReadError).code;
    }
    throw new Error("Expected a DocxReadError");
  };

  it("refuses a document.xml larger than the limit, while unzipping", async () => {
    // A tiny zip bomb: 1 MB of spaces zips down to about 1 KB. With a
    // 64 KB limit it's refused, the same way the real 50 MB limit refuses
    // a bigger one. Kept small so tests never strain the server's memory.
    const zip = new JSZip();
    zip.file("word/document.xml", Buffer.alloc(1024 * 1024, 0x20));
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bomb.length).toBeLessThan(16 * 1024);
    expect(await errorCode(parseDocx(bomb, 64 * 1024))).toBe("too_large");
  });

  // A zip that lies: its headers say document.xml unpacks to 100 bytes,
  // but it really unpacks to 1 MB. Only counting while unzipping can
  // catch this, which is why the reader never trusts the headers.
  async function lyingZip(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file("word/document.xml", Buffer.alloc(1024 * 1024, 0x20));
    const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    // The declared unpacked size is stored twice: in the file's own header
    // and in the zip's table of contents. Each is found from where the
    // file's name appears after it. (The zip also holds a "word/" folder
    // entry, so the first header in the zip isn't the right one.)
    const name = Buffer.from("word/document.xml");
    const header = bytes.indexOf(name) - 30; // name starts at byte 30
    const entry = bytes.indexOf(name, header + 31) - 46; // and at byte 46 here
    expect(bytes.readUInt32LE(header)).toBe(0x04034b50); // file header marker
    expect(bytes.readUInt32LE(entry)).toBe(0x02014b50); // table of contents marker
    expect(bytes.readUInt32LE(header + 22)).toBe(1024 * 1024);
    expect(bytes.readUInt32LE(entry + 24)).toBe(1024 * 1024);
    bytes.writeUInt32LE(100, header + 22);
    bytes.writeUInt32LE(100, entry + 24);
    return bytes;
  }

  it("refuses a zip that declares a small size but unpacks to more than the limit", async () => {
    // "too_large" rather than "unreadable" shows our counter stopped it
    // mid-way. jszip only compares the real size with the declared one
    // after unpacking everything, which for a real bomb is far too late.
    expect(await errorCode(parseDocx(await lyingZip(), 64 * 1024))).toBe("too_large");
  });

  it("refuses a zip whose declared size is wrong, even under the limit", async () => {
    // Here the real size (1 MB) is under the limit, so jszip's own check
    // at the end catches the mismatch. It must come out as our normal
    // "unreadable" error, not crash the server.
    expect(await errorCode(parseDocx(await lyingZip(), 2 * 1024 * 1024))).toBe("unreadable");
  });

  it("applies a custom size limit", async () => {
    const bytes = await makeDocx(doc("<w:p><w:r><w:t>Short.</w:t></w:r></w:p>"));
    expect(await errorCode(parseDocx(bytes, 50))).toBe("too_large");
  });

  it("refuses a DOCTYPE", async () => {
    const xml = `<!DOCTYPE w:document><w:document ${W}><w:body><w:p/></w:body></w:document>`;
    expect(await errorCode(parseDocx(await makeDocx(xml)))).toBe("unreadable");
  });

  it("refuses files that aren't Word documents", async () => {
    expect(await errorCode(parseDocx(Buffer.from("not a zip at all")))).toBe("unreadable");
    const zip = new JSZip();
    zip.file("something-else.xml", "<x/>");
    const noDocument = await zip.generateAsync({ type: "nodebuffer" });
    expect(await errorCode(parseDocx(noDocument))).toBe("unreadable");
  });

  it("never puts document text in the error message", async () => {
    const broken = doc("<w:p><w:r><w:t>Confidential finding about Site B</w:t></w:p>");
    try {
      await parseDocx(await makeDocx(broken));
      throw new Error("Expected a DocxReadError");
    } catch (error) {
      expect(error).toBeInstanceOf(DocxReadError);
      expect(String((error as Error).message)).not.toContain("Confidential");
      expect((error as Error).cause).toBeUndefined();
    }
  });
});

describe("readParagraphs", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("reads a job's file from UPLOAD_DIR", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "rh-test-"));
    process.env.UPLOAD_DIR = dir;
    const text = "This paragraph is long enough to count as one.";
    await writeFile(
      path.join(dir, "cjob123.docx"),
      await makeDocx(doc(`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`)),
    );
    const { paragraphs } = await readParagraphs("cjob123");
    expect(paragraphs.map((p) => p.text)).toEqual([text]);
  });

  it("refuses a job id that could point outside the upload folder", async () => {
    await expect(readParagraphs("../secrets")).rejects.toThrow("Invalid job id.");
  });
});
