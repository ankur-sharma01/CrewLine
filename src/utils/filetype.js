import path from "path";

const startsWith = (buf, bytes) => bytes.every((b, i) => buf[i] === b);
const ascii = (buf, from, to) => buf.toString("latin1", from, to);

export const detectType = (buf) => {
  if (buf.length < 4) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (["GIF87a", "GIF89a"].includes(ascii(buf, 0, 6))) return "image/gif";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "image/webp";
  if (ascii(buf, 0, 5) === "%PDF-") return "application/pdf";
  // text/csv: valid utf-8, no NUL bytes
  if (!buf.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf);
      return "text/plain";
    } catch {
      return null;
    }
  }
  return null;
};

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const ATTACHMENT_TYPES = [...IMAGE_TYPES, "application/pdf", "text/plain"];

// strip folders, quotes and control chars from file names
export const safeFilename = (name = "") =>
  path
    .basename(String(name))
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, "_")
    .slice(0, 120) || "file";
