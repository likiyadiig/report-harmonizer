// Writes each parity fixture as a real .docx OUTSIDE the project folder, so
// the Python prototype can read it:
//
//   npm run fixture:build
//   python3 prototype/read_report.py <printed path> > tests/fixtures/parity/<name>/python-output.txt
//
// The fixtures are made-up text, so their Python output is safe to commit.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { makeDocx } from "../tests/helpers/make-docx.mjs";

const parityDir = path.resolve(import.meta.dirname, "../tests/fixtures/parity");
const outDir = path.join(os.tmpdir(), "report-harmonizer-fixtures");
await mkdir(outDir, { recursive: true });

for (const name of (await readdir(parityDir)).sort()) {
  const xml = await readFile(path.join(parityDir, name, "document.xml"), "utf8");
  const outFile = path.join(outDir, `${name}.docx`);
  await writeFile(outFile, await makeDocx(xml));
  console.log(outFile);
}
