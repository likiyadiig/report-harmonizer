// A .docx is a zip file that contains word/document.xml. We check that by
// reading the zip's table of contents (the "central directory"), without
// unzipping anything.

const END_OF_CENTRAL_DIR = 0x06054b50;
const CENTRAL_DIR_ENTRY = 0x02014b50;
const END_RECORD_SIZE = 22;
const MAX_ZIP_COMMENT = 0xffff;

export function isDocx(bytes: Buffer): boolean {
  // The end record sits at the very end of the file, followed only by an
  // optional comment of up to 64 KB, so search backwards for it.
  const lastStart = bytes.length - END_RECORD_SIZE;
  const firstStart = Math.max(0, lastStart - MAX_ZIP_COMMENT);
  let end = -1;
  for (let i = lastStart; i >= firstStart; i--) {
    if (bytes.readUInt32LE(i) === END_OF_CENTRAL_DIR) {
      end = i;
      break;
    }
  }
  if (end === -1) return false;

  const entryCount = bytes.readUInt16LE(end + 10);
  let pos = bytes.readUInt32LE(end + 16);

  for (let n = 0; n < entryCount; n++) {
    if (pos + 46 > bytes.length) return false;
    if (bytes.readUInt32LE(pos) !== CENTRAL_DIR_ENTRY) return false;
    const nameLength = bytes.readUInt16LE(pos + 28);
    const extraLength = bytes.readUInt16LE(pos + 30);
    const commentLength = bytes.readUInt16LE(pos + 32);
    const nameEnd = pos + 46 + nameLength;
    if (nameEnd > bytes.length) return false;
    if (bytes.toString("utf8", pos + 46, nameEnd) === "word/document.xml") {
      return true;
    }
    pos = nameEnd + extraLength + commentLength;
  }
  return false;
}
