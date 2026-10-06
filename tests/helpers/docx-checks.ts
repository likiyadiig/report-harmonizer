// Test helpers for the tracked changes writer: what Word does on "accept
// all changes" and "reject all changes", and a check that a .docx holds
// together (every part is well-formed XML, every link points at a real
// part, every part has a content type, and every comment is complete).
import path from "node:path";
import JSZip from "jszip";
import { SaxesParser } from "saxes";

// Accept all: deleted text goes, inserted text stays as ordinary text.
export function acceptAll(documentXml: string): string {
  return documentXml
    .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, "")
    .replace(/<w:ins\b[^>]*>|<\/w:ins>/g, "");
}

// Reject all: inserted text goes, deleted text comes back.
export function rejectAll(documentXml: string): string {
  return documentXml
    .replace(/<w:ins\b[^>]*>[\s\S]*?<\/w:ins>/g, "")
    .replace(/<w:del\b[^>]*>|<\/w:del>/g, "")
    .replace(/<w:delText\b/g, "<w:t")
    .replace(/<\/w:delText>/g, "</w:t>");
}

// Returns a list of problems; empty means the .docx holds together.
export async function docxProblems(bytes: Buffer): Promise<string[]> {
  const problems: string[] = [];
  const zip = await JSZip.loadAsync(bytes);
  const parts = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const text = new Map<string, string>();
  for (const name of parts) text.set(name, await zip.file(name)!.async("string"));

  for (const [name, xml] of text) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    try {
      new SaxesParser({ xmlns: true }).write(xml).close();
    } catch (error) {
      problems.push(`${name} is not well-formed XML: ${(error as Error).message}`);
    }
  }

  // Every internal relationship target exists.
  for (const [name, xml] of text) {
    if (!name.endsWith(".rels")) continue;
    const base = path.posix.dirname(path.posix.dirname(name));
    for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
      if (/TargetMode="External"/.test(m[0])) continue;
      const target = /Target="([^"]*)"/.exec(m[0])![1];
      const resolved = target.startsWith("/")
        ? target.slice(1)
        : path.posix.normalize(path.posix.join(base, target));
      if (!text.has(resolved)) problems.push(`${name} points at missing ${resolved}`);
    }
  }

  // Every part has a content type, by its own entry or by its extension.
  const types = text.get("[Content_Types].xml") ?? "";
  const overrides = new Set(
    [...types.matchAll(/PartName="\/([^"]*)"/g)].map((m) => m[1].toLowerCase()),
  );
  const defaults = new Set(
    [...types.matchAll(/<Default\b[^>]*Extension="([^"]*)"/g)].map((m) => m[1].toLowerCase()),
  );
  for (const name of parts) {
    if (name === "[Content_Types].xml") continue;
    // Not path.extname: it says "_rels/.rels" has no extension.
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    if (!overrides.has(name.toLowerCase()) && !defaults.has(ext)) {
      problems.push(`${name} has no content type`);
    }
  }

  // Tracked change ids are unique, and every comment mark in the document
  // has its comment, and the other way round.
  const document = text.get("word/document.xml") ?? "";
  const changeIds = [...document.matchAll(/<w:(?:ins|del)\b[^>]*\bw:id="(\d+)"/g)].map((m) => m[1]);
  if (new Set(changeIds).size !== changeIds.length) problems.push("duplicate tracked change ids");
  const comments = text.get("word/comments.xml") ?? "";
  const commentIds = [...comments.matchAll(/<w:comment\b[^>]*\bw:id="(\d+)"/g)].map((m) => m[1]);
  if (new Set(commentIds).size !== commentIds.length) problems.push("duplicate comment ids");
  for (const mark of ["commentRangeStart", "commentRangeEnd", "commentReference"]) {
    const ids = [...document.matchAll(new RegExp(`<w:${mark} w:id="(\\d+)"`, "g"))].map((m) => m[1]);
    if (ids.sort().join() !== [...commentIds].sort().join()) {
      problems.push(`${mark} ids don't match the comments`);
    }
  }
  if (commentIds.length > 0) {
    if (!/Type="[^"]*\/comments"/.test(text.get("word/_rels/document.xml.rels") ?? "")) {
      problems.push("comments part has no relationship");
    }
    if (!overrides.has("word/comments.xml")) problems.push("comments part has no content type");
  }
  return problems;
}
